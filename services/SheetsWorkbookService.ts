import { getAccountService, getTransactionService } from "../database";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

const TAB = {
  DASHBOARD: "Dashboard",
  TRANSACTIONS: "Transactions",
  ACCOUNTS: "Accounts",
  CATEGORIES: "Categories",
} as const;

const TAB_ORDER = [TAB.DASHBOARD, TAB.TRANSACTIONS, TAB.ACCOUNTS, TAB.CATEGORIES];

type SheetIds = Record<string, number>;

const HEADER_FORMAT = {
  backgroundColor: { red: 0.078, green: 0.722, blue: 0.651 }, // matches app primary #14b8a6
  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
};

const SECTION_FORMAT = {
  backgroundColor: { red: 0.9, green: 0.97, blue: 0.96 },
  textFormat: { bold: true, fontSize: 12 },
};

/**
 * Builds and refreshes the Google Sheets workbook: a Dashboard tab with key
 * stats and charts, plus Transactions/Accounts/Categories tabs holding the
 * underlying data. Recreates formatting and charts on every push rather than
 * trying to diff them, since that's far simpler than tracking what changed
 * and the cost is just a few extra API calls.
 */
class SheetsWorkbookService {
  public async refresh(accessToken: string, spreadsheetId: string): Promise<void> {
    const existing = await this.getExistingStructure(accessToken, spreadsheetId);
    const sheetIds = await this.ensureStructure(accessToken, spreadsheetId, existing);

    const data = this.gatherData();

    await this.clearRanges(accessToken, spreadsheetId);
    await this.writeData(accessToken, spreadsheetId, data);
    await this.applyFormattingAndCharts(accessToken, spreadsheetId, sheetIds, data);
  }

  // ---- Data gathering -----------------------------------------------------

  private gatherData() {
    const accountService = getAccountService();
    const transactionService = getTransactionService();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const totalBalance = accountService.getTotalAccountsBalance();
    const monthlyIncome = transactionService.getTotalIncome(monthStart, monthEnd);
    const monthlyExpenses = transactionService.getTotalExpenses(monthStart, monthEnd);
    const net = monthlyIncome - monthlyExpenses;
    const savingsRate = monthlyIncome > 0 ? net / monthlyIncome : 0;

    const monthlyTrend = transactionService.getMonthlyTrend(6);
    const categorySummary = transactionService.getCategorySummary(monthStart, monthEnd);
    const categoryTotal = categorySummary.reduce((sum, c) => sum + c.amount, 0);

    const accounts = accountService.getAccounts();
    const transactions = transactionService.getAllTransactionsForExport();

    return {
      totalBalance,
      monthlyIncome,
      monthlyExpenses,
      net,
      savingsRate,
      monthlyTrend,
      categorySummary: categorySummary.map((c) => ({
        ...c,
        percentage: categoryTotal > 0 ? c.amount / categoryTotal : 0,
      })),
      accounts,
      transactions,
    };
  }

  // ---- Structure (tabs) -----------------------------------------------------

  private async getExistingStructure(accessToken: string, spreadsheetId: string) {
    const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets(properties,charts.chartId,conditionalFormats)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      throw new Error("Failed to read spreadsheet structure.");
    }
    return (await response.json()) as {
      sheets: Array<{
        properties: { sheetId: number; title: string };
        charts?: Array<{ chartId: number }>;
        conditionalFormats?: unknown[];
      }>;
    };
  }

  private async ensureStructure(
    accessToken: string,
    spreadsheetId: string,
    existing: Awaited<ReturnType<SheetsWorkbookService["getExistingStructure"]>>,
  ): Promise<SheetIds> {
    const byTitle = new Map(existing.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
    const existingBySheetId = new Map(existing.sheets.map((s) => [s.properties.sheetId, s]));
    const requests: any[] = [];
    const sheetIds: SheetIds = {};

    // A pre-existing "Sheet1" is the old flat layout - rename it to keep its
    // transaction IDs intact instead of losing sync continuity.
    if (byTitle.has("Sheet1") && !byTitle.has(TAB.TRANSACTIONS)) {
      const sheetId = byTitle.get("Sheet1")!;
      byTitle.set(TAB.TRANSACTIONS, sheetId);
      byTitle.delete("Sheet1");
    }

    TAB_ORDER.forEach((title, index) => {
      if (byTitle.has(title)) {
        const sheetId = byTitle.get(title)!;
        sheetIds[title] = sheetId;

        // Remove old conditional format rules for this sheet - we re-add
        // identical rules on every refresh, and without this they'd pile up
        // duplicates forever. Delete from the highest index down so removing
        // one doesn't shift the index of the ones still to be removed.
        const ruleCount = existingBySheetId.get(sheetId)?.conditionalFormats?.length || 0;
        for (let i = ruleCount - 1; i >= 0; i--) {
          requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
        }

        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId,
              title,
              index,
              gridProperties: { frozenRowCount: title === TAB.DASHBOARD ? 3 : 1 },
            },
            fields: "title,index,gridProperties.frozenRowCount",
          },
        });
      } else {
        requests.push({
          addSheet: {
            properties: {
              title,
              index,
              gridProperties: { frozenRowCount: title === TAB.DASHBOARD ? 3 : 1 },
            },
          },
        });
      }
    });

    // Remove any charts we previously drew on the Dashboard so re-adding
    // them below doesn't pile up duplicates.
    const dashboardSheet = existing.sheets.find((s) => s.properties.title === TAB.DASHBOARD);
    dashboardSheet?.charts?.forEach((chart) => {
      requests.push({ deleteEmbeddedObject: { objectId: chart.chartId } });
    });

    const response = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Failed to set up workbook structure:", errorBody);
      throw new Error("Failed to set up spreadsheet tabs.");
    }

    const result = await response.json();
    (result.replies || []).forEach((reply: any) => {
      if (reply.addSheet) {
        sheetIds[reply.addSheet.properties.title] = reply.addSheet.properties.sheetId;
      }
    });

    return sheetIds;
  }

  // ---- Writing data -----------------------------------------------------

  private async clearRanges(accessToken: string, spreadsheetId: string) {
    await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchClear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ranges: TAB_ORDER }),
    });
  }

  private async writeData(accessToken: string, spreadsheetId: string, data: ReturnType<SheetsWorkbookService["gatherData"]>) {
    const dashboardValues: any[][] = [
      ["📊 Kakeibo Dashboard", "", "", ""],
      [`Last updated: ${new Date().toLocaleString()}`, "", "", ""],
      [],
      ["💰 This Month", "", "", ""],
      ["Income", "Expenses", "Net", "Savings Rate"],
      [data.monthlyIncome, data.monthlyExpenses, data.net, data.savingsRate],
      [],
      ["🏦 Total Balance", "", "", ""],
      [data.totalBalance, "", "", ""],
      [],
      ["📈 6-Month Trend (drives the chart to the right)", "", "", ""],
      ["Month", "Income", "Expenses"],
      ...data.monthlyTrend.map((m) => [m.month, m.income, m.expenses]),
    ];

    const transactionsValues = [
      ["ID", "Date", "Type", "Category", "Amount", "Description", "Payment Method", "Account ID", "Profile ID"],
      ...data.transactions.map((t) => [
        t.id,
        t.date,
        t.type,
        t.category,
        t.amount,
        t.description,
        t.paymentMethod,
        t.accountId,
        t.profileId,
      ]),
    ];

    const accountsValues = [
      ["Name", "Type", "Balance", "Currency", "Notes"],
      ...data.accounts.map((a) => [
        a.name,
        a.type,
        a.balance,
        a.currency,
        a.type === "loan"
          ? `${a.isLending ? "Lent to" : "Borrowed from"} ${a.loanCounterpartyName || "?"}`
          : a.bankName || "",
      ]),
    ];

    const categoriesValues = [
      ["Category", "Amount", "% of Month"],
      ...data.categorySummary.map((c) => [c.category, c.amount, c.percentage]),
    ];

    const response = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          { range: TAB.DASHBOARD, values: dashboardValues },
          { range: TAB.TRANSACTIONS, values: transactionsValues },
          { range: TAB.ACCOUNTS, values: accountsValues },
          { range: TAB.CATEGORIES, values: categoriesValues },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Failed to write workbook data:", errorBody);
      throw new Error("Failed to write data to Google Sheets.");
    }
  }

  // ---- Formatting & charts -----------------------------------------------------

  private async applyFormattingAndCharts(
    accessToken: string,
    spreadsheetId: string,
    sheetIds: SheetIds,
    data: ReturnType<SheetsWorkbookService["gatherData"]>,
  ) {
    const requests: any[] = [];

    const headerRow = (sheetId: number, columnCount: number) => ({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: { userEnteredFormat: HEADER_FORMAT },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });

    const columnWidth = (sheetId: number, startColumnIndex: number, endColumnIndex: number, pixelSize: number) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startColumnIndex, endColumnIndex },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    });

    const numberFormat = (
      sheetId: number,
      startRowIndex: number,
      endRowIndex: number,
      startColumnIndex: number,
      endColumnIndex: number,
      pattern: string,
    ) => ({
      repeatCell: {
        range: { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex },
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });

    // --- Transactions sheet ---
    const txSheetId = sheetIds[TAB.TRANSACTIONS];
    requests.push(headerRow(txSheetId, 9));
    requests.push(columnWidth(txSheetId, 5, 6, 220)); // Description
    requests.push(numberFormat(txSheetId, 1, data.transactions.length + 1, 4, 5, "#,##0.00"));
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: txSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 }],
          booleanRule: {
            condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=$C2="expense"' }] },
            format: { textFormat: { foregroundColor: { red: 0.94, green: 0.27, blue: 0.27 } } },
          },
        },
        index: 0,
      },
    });
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: txSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 }],
          booleanRule: {
            condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=$C2="income"' }] },
            format: { textFormat: { foregroundColor: { red: 0.06, green: 0.72, blue: 0.51 } } },
          },
        },
        index: 0,
      },
    });

    // --- Accounts sheet ---
    const acctSheetId = sheetIds[TAB.ACCOUNTS];
    requests.push(headerRow(acctSheetId, 5));
    requests.push(columnWidth(acctSheetId, 4, 5, 220)); // Notes
    requests.push(numberFormat(acctSheetId, 1, data.accounts.length + 1, 2, 3, "#,##0.00"));
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: acctSheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 }],
          booleanRule: {
            condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] },
            format: { textFormat: { foregroundColor: { red: 0.94, green: 0.27, blue: 0.27 } } },
          },
        },
        index: 0,
      },
    });

    // --- Categories sheet ---
    const catSheetId = sheetIds[TAB.CATEGORIES];
    requests.push(headerRow(catSheetId, 3));
    requests.push(numberFormat(catSheetId, 1, data.categorySummary.length + 1, 1, 2, "#,##0.00"));
    requests.push({
      repeatCell: {
        range: { sheetId: catSheetId, startRowIndex: 1, endRowIndex: data.categorySummary.length + 1, startColumnIndex: 2, endColumnIndex: 3 },
        cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.0%" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });

    // --- Dashboard sheet ---
    const dashSheetId = sheetIds[TAB.DASHBOARD];
    const trendStartRow = 11; // 0-indexed row of the "Month | Income | Expenses" header
    const trendDataEndRow = trendStartRow + 1 + data.monthlyTrend.length;

    requests.push({
      mergeCells: { range: { sheetId: dashSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 }, mergeType: "MERGE_ALL" },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: dashSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 18 } } },
        fields: "userEnteredFormat.textFormat",
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: dashSheetId, startRowIndex: 1, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
        cell: { userEnteredFormat: { textFormat: { italic: true, foregroundColor: { red: 0.5, green: 0.5, blue: 0.5 } } } },
        fields: "userEnteredFormat.textFormat",
      },
    });
    [3, 7, 10].forEach((rowIndex) => {
      requests.push({
        repeatCell: {
          range: { sheetId: dashSheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 6 },
          cell: { userEnteredFormat: SECTION_FORMAT },
          fields: "userEnteredFormat(backgroundColor,textFormat)",
        },
      });
    });
    // "Income | Expenses | Net | Savings Rate" row (row index 4)
    requests.push({
      repeatCell: {
        range: { sheetId: dashSheetId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: 4 },
        cell: { userEnteredFormat: HEADER_FORMAT },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: dashSheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 3 },
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0.00" }, textFormat: { bold: true, fontSize: 14 } } },
        fields: "userEnteredFormat(numberFormat,textFormat)",
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: dashSheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 3, endColumnIndex: 4 },
        cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0%" }, textFormat: { bold: true, fontSize: 14 } } },
        fields: "userEnteredFormat(numberFormat,textFormat)",
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: dashSheetId, startRowIndex: 8, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0.00" }, textFormat: { bold: true, fontSize: 20 } } },
        fields: "userEnteredFormat(numberFormat,textFormat)",
      },
    });
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: dashSheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 2, endColumnIndex: 4 }],
          booleanRule: {
            condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] },
            format: { textFormat: { foregroundColor: { red: 0.94, green: 0.27, blue: 0.27 } } },
          },
        },
        index: 0,
      },
    });
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{ sheetId: dashSheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 2, endColumnIndex: 4 }],
          booleanRule: {
            condition: { type: "NUMBER_GREATER_THAN_EQ", values: [{ userEnteredValue: "0" }] },
            format: { textFormat: { foregroundColor: { red: 0.06, green: 0.72, blue: 0.51 } } },
          },
        },
        index: 0,
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: dashSheetId, startRowIndex: trendStartRow, endRowIndex: trendStartRow + 1, startColumnIndex: 0, endColumnIndex: 3 },
        cell: { userEnteredFormat: HEADER_FORMAT },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
    requests.push(columnWidth(dashSheetId, 0, 1, 200));

    // Charts, anchored to the right of the tables they're built from.
    if (data.monthlyTrend.length > 0) {
      requests.push({
        addChart: {
          chart: {
            spec: {
              title: "Income vs Expenses (6 months)",
              basicChart: {
                chartType: "COLUMN",
                legendPosition: "BOTTOM_LEGEND",
                axis: [{ position: "BOTTOM_AXIS" }, { position: "LEFT_AXIS" }],
                domains: [{ domain: { sourceRange: { sources: [{ sheetId: dashSheetId, startRowIndex: trendStartRow, endRowIndex: trendDataEndRow, startColumnIndex: 0, endColumnIndex: 1 }] } } }],
                series: [
                  { series: { sourceRange: { sources: [{ sheetId: dashSheetId, startRowIndex: trendStartRow, endRowIndex: trendDataEndRow, startColumnIndex: 1, endColumnIndex: 2 }] } }, targetAxis: "LEFT_AXIS" },
                  { series: { sourceRange: { sources: [{ sheetId: dashSheetId, startRowIndex: trendStartRow, endRowIndex: trendDataEndRow, startColumnIndex: 2, endColumnIndex: 3 }] } }, targetAxis: "LEFT_AXIS" },
                ],
                headerCount: 1,
              },
            },
            position: { overlayPosition: { anchorCell: { sheetId: dashSheetId, rowIndex: 3, columnIndex: 4 }, widthPixels: 480, heightPixels: 260 } },
          },
        },
      });
    }

    if (data.categorySummary.length > 0) {
      requests.push({
        addChart: {
          chart: {
            spec: {
              title: "Spending by Category (This Month)",
              pieChart: {
                legendPosition: "RIGHT_LEGEND",
                domain: { sourceRange: { sources: [{ sheetId: catSheetId, startRowIndex: 1, endRowIndex: data.categorySummary.length + 1, startColumnIndex: 0, endColumnIndex: 1 }] } },
                series: { sourceRange: { sources: [{ sheetId: catSheetId, startRowIndex: 1, endRowIndex: data.categorySummary.length + 1, startColumnIndex: 1, endColumnIndex: 2 }] } },
              },
            },
            position: { overlayPosition: { anchorCell: { sheetId: dashSheetId, rowIndex: 3, columnIndex: 11 }, widthPixels: 480, heightPixels: 260 } },
          },
        },
      });
    }

    const response = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Failed to apply workbook formatting/charts:", errorBody);
      // Formatting is cosmetic - don't fail the whole sync over it.
    }
  }
}

const sheetsWorkbookServiceInstance = new SheetsWorkbookService();
export const getSheetsWorkbookService = (): SheetsWorkbookService => sheetsWorkbookServiceInstance;
export { TAB as SHEET_TABS };
