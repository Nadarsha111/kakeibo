import { getAccountService, getCategoryService, getProfileService, getTransactionService } from "../database";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

const TAB = {
  DASHBOARD: "Dashboard",
  TRANSACTIONS: "Transactions",
  ACCOUNTS: "Accounts",
  CATEGORIES: "Categories",
} as const;

// Every profile also gets its own dashboard tab. The prefix marks tabs this service owns, so ones
// left behind by a deleted or renamed profile can be found and removed.
const PROFILE_TAB_PREFIX = "Profile - ";

/** Sheet names in A1 ranges must be quoted when they contain spaces or punctuation. */
const quoteTab = (title: string) => `'${title.replace(/'/g, "''")}'`;

/** A unique tab title for a profile. Sheets compares titles case-insensitively and caps them at 100 characters. */
const profileTabTitle = (name: string, id: number, used: Set<string>) => {
  const base = `${PROFILE_TAB_PREFIX}${name.trim() || `Profile ${id}`}`.slice(0, 90);
  const title = used.has(base.toLowerCase()) ? `${base} (${id})` : base;
  used.add(title.toLowerCase());
  return title;
};

type SheetIds = Record<string, number>;

// Colors. Backgrounds and normal text are deliberately left unset ("automatic") so the sheet
// follows the viewer's own light or dark theme in Google Sheets. Only colors that carry meaning
// are set explicitly, each picked to stay readable (about 4:1 or better) on white AND on black.
const AMBER = { red: 0.96, green: 0.62, blue: 0.043 }; // #f59e0b header rows
const BLACK = { red: 0, green: 0, blue: 0 };
const MUTED = { red: 0.451, green: 0.451, blue: 0.451 }; // #737373 notes and the ID column
const RED = { red: 0.863, green: 0.149, blue: 0.149 }; // #dc2626
const GREEN = { red: 0.082, green: 0.502, blue: 0.239 }; // #15803d
const MONEY = "#,##0.00";

// Google's default spreadsheet theme (white background, black text). An earlier version of this
// service forced a black theme onto the spreadsheet, so it is restored once on those files.
// Google requires all nine color pairs whenever the theme is updated.
const rgb = (hex: string) => ({
  rgbColor: {
    red: parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue: parseInt(hex.slice(5, 7), 16) / 255,
  },
});
const DEFAULT_SPREADSHEET_THEME = {
  themeColors: [
    { colorType: "TEXT", color: rgb("#000000") },
    { colorType: "BACKGROUND", color: rgb("#ffffff") },
    { colorType: "ACCENT1", color: rgb("#4285f4") },
    { colorType: "ACCENT2", color: rgb("#ea4335") },
    { colorType: "ACCENT3", color: rgb("#fbbc04") },
    { colorType: "ACCENT4", color: rgb("#34a853") },
    { colorType: "ACCENT5", color: rgb("#ff6d01") },
    { colorType: "ACCENT6", color: rgb("#46bdc6") },
    { colorType: "LINK", color: rgb("#1155cc") },
  ],
};

// The header is amber with black text; both are explicit, so it looks the same in either theme.
const HEADER_FORMAT = {
  backgroundColor: AMBER,
  textFormat: { bold: true, foregroundColor: BLACK },
};

const SECTION_TEXT = { bold: true, fontSize: 12 };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  loan: "Loan",
  investment: "Investment",
};

/** "2026-09" -> "Sep 2026". */
const monthLabel = (key: string) => {
  const [year, month] = key.split("-");
  return `${MONTH_NAMES[parseInt(month, 10) - 1] ?? month} ${year}`;
};

/**
 * Builds and refreshes the Google Sheets workbook. Each tab has one job:
 *  - Dashboard: this month at a glance, a per-profile breakdown, a 6-month trend and two charts,
 *    all profiles combined.
 *  - Profile - <name>: the same numbers and charts for a single profile, plus its accounts. One
 *    tab per profile, created and removed as profiles come and go (read-only).
 *  - Transactions: every transaction, one row each. This is the only tab that can be edited and
 *    pulled back into the app, so it has dropdowns, a filter and readable Account/Profile names.
 *  - Accounts: balances per profile (read-only).
 *  - Categories: this month's spending by category (read-only, feeds the pie chart).
 * Formatting and charts are recreated on every push rather than diffed, since that's far simpler
 * than tracking what changed and the cost is just a few extra API calls.
 */
class SheetsWorkbookService {
  public async refresh(accessToken: string, spreadsheetId: string): Promise<void> {
    const existing = await this.getExistingStructure(accessToken, spreadsheetId);

    const data = this.gatherData();
    const titles = [TAB.DASHBOARD, ...data.profileTabs.map((p) => p.title), TAB.TRANSACTIONS, TAB.ACCOUNTS, TAB.CATEGORIES];
    const sheetIds = await this.ensureStructure(accessToken, spreadsheetId, existing, titles);
    const dashboard = this.buildDashboard(data);
    const profileDashboards = data.profileTabs.map((profile) => this.buildProfileDashboard(profile));

    // Re-setting a basic filter wipes whatever filter the user has applied, so only create it once.
    const transactionsSheet = existing.sheets.find((s) => s.properties.sheetId === sheetIds[TAB.TRANSACTIONS]);
    const hasTransactionFilter = !!transactionsSheet?.basicFilter;

    // A black spreadsheet background means an earlier version of this service forced a dark
    // theme onto the file. That needs undoing once so the sheet can follow the viewer's theme.
    // (Google omits zero color channels from its JSON, so a missing channel means 0.)
    const background = existing.properties?.spreadsheetTheme?.themeColors?.find((c) => c.colorType === "BACKGROUND")?.color;
    const backgroundRgb = background?.rgbColor;
    const hadBlackTheme =
      !!background && !background.themeColor && (backgroundRgb?.red ?? 0) + (backgroundRgb?.green ?? 0) + (backgroundRgb?.blue ?? 0) < 0.3;

    // Not every earlier dark version touched the theme (the navy one only colored cells), so the
    // Transactions cleanup can't key off the theme - it looks at the cells themselves.
    const hadDarkCells = await this.hasForcedDarkCells(accessToken, spreadsheetId);

    await this.clearRanges(accessToken, spreadsheetId, titles);
    await this.writeData(accessToken, spreadsheetId, data, dashboard, profileDashboards);
    await this.applyFormattingAndCharts(accessToken, spreadsheetId, sheetIds, data, dashboard, profileDashboards, hasTransactionFilter, hadBlackTheme, hadDarkCells);
  }

  /**
   * True when a Transactions data cell has a dark background color, which no current version sets:
   * it means an earlier version forced a dark look onto the tab. Google leaves out zero color
   * channels, so a present-but-empty color means black. Any failure reads as "no", since the
   * cleanup this triggers is only worth doing when we are sure.
   */
  private async hasForcedDarkCells(accessToken: string, spreadsheetId: string): Promise<boolean> {
    try {
      const probe = encodeURIComponent(`${TAB.TRANSACTIONS}!B2`);
      const fields = "sheets(data(rowData(values(userEnteredFormat(backgroundColor)))))";
      const response = await fetch(`${SHEETS_API}/${spreadsheetId}?ranges=${probe}&fields=${fields}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return false;

      const json = await response.json();
      const bg = json.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.userEnteredFormat?.backgroundColor;
      if (!bg) return false;
      return (bg.red ?? 0) + (bg.green ?? 0) + (bg.blue ?? 0) < 0.9;
    } catch {
      return false;
    }
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

    const profiles = getProfileService().getProfiles();
    const profileNameById = new Map(profiles.map((p) => [p.id, p.name]));
    const profileRows = profiles.map((p) => {
      const income = transactionService.getTotalIncome(monthStart, monthEnd, p.id);
      const expenses = transactionService.getTotalExpenses(monthStart, monthEnd, p.id);
      return {
        name: p.name,
        balance: accountService.getTotalAccountsBalance(p.id),
        income,
        expenses,
        net: income - expenses,
      };
    });

    // Everything the Dashboard shows, but for one profile at a time (one tab each).
    const usedTitles = new Set<string>();
    const profileTabs = profiles.map((p, index) => {
      const row = profileRows[index];
      const summary = transactionService.getCategorySummary(monthStart, monthEnd, p.id);
      const summaryTotal = summary.reduce((sum, c) => sum + c.amount, 0);
      return {
        ...row,
        title: profileTabTitle(p.name, p.id, usedTitles),
        savingsRate: row.income > 0 ? row.net / row.income : 0,
        monthlyTrend: transactionService.getMonthlyTrend(6, p.id),
        categorySummary: summary.map((c) => ({ ...c, percentage: summaryTotal > 0 ? c.amount / summaryTotal : 0 })),
        accounts: accountService.getAccounts(p.id),
      };
    });

    const accounts = accountService
      .getAccounts()
      .slice()
      .sort((a, b) => {
        const byProfile = (profileNameById.get(a.profileId) ?? "").localeCompare(profileNameById.get(b.profileId) ?? "");
        return byProfile !== 0 ? byProfile : a.name.localeCompare(b.name);
      });
    const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

    const transactions = transactionService.getAllTransactionsForExport();
    const categoryNames = getCategoryService()
      .getCategories()
      .map((c) => c.name);

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
      profileRows,
      profileTabs,
      profileNameById,
      accounts,
      accountNameById,
      transactions,
      categoryNames,
    };
  }

  // ---- Structure (tabs) -----------------------------------------------------

  private async getExistingStructure(accessToken: string, spreadsheetId: string) {
    const url = `${SHEETS_API}/${spreadsheetId}?fields=properties.spreadsheetTheme,sheets(properties,charts.chartId,conditionalFormats,basicFilter)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      throw new Error("Failed to read spreadsheet structure.");
    }
    return (await response.json()) as {
      properties?: {
        spreadsheetTheme?: {
          themeColors?: Array<{ colorType: string; color?: { rgbColor?: { red?: number; green?: number; blue?: number }; themeColor?: string } }>;
        };
      };
      sheets: Array<{
        properties: { sheetId: number; title: string };
        charts?: Array<{ chartId: number }>;
        conditionalFormats?: unknown[];
        basicFilter?: unknown;
      }>;
    };
  }

  private async ensureStructure(
    accessToken: string,
    spreadsheetId: string,
    existing: Awaited<ReturnType<SheetsWorkbookService["getExistingStructure"]>>,
    titles: string[],
  ): Promise<SheetIds> {
    const byTitle = new Map(existing.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
    const existingBySheetId = new Map(existing.sheets.map((s) => [s.properties.sheetId, s]));
    const requests: any[] = [];
    const sheetIds: SheetIds = {};

    // Title + "last updated" stay visible on the dashboards; every other tab keeps its header row visible.
    const isDashboard = (title: string) => title === TAB.DASHBOARD || title.startsWith(PROFILE_TAB_PREFIX);
    const frozenRows = (title: string) => (isDashboard(title) ? 2 : 1);

    // Profile tabs whose profile was deleted or renamed. Removed first so the indexes below stay right.
    existing.sheets.forEach((sheet) => {
      const { title, sheetId } = sheet.properties;
      if (title.startsWith(PROFILE_TAB_PREFIX) && !titles.includes(title)) {
        requests.push({ deleteSheet: { sheetId } });
      }
    });

    // A pre-existing "Sheet1" is the old flat layout - rename it to keep its
    // transaction IDs intact instead of losing sync continuity.
    if (byTitle.has("Sheet1") && !byTitle.has(TAB.TRANSACTIONS)) {
      const sheetId = byTitle.get("Sheet1")!;
      byTitle.set(TAB.TRANSACTIONS, sheetId);
      byTitle.delete("Sheet1");
    }

    titles.forEach((title, index) => {
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
              gridProperties: { frozenRowCount: frozenRows(title), hideGridlines: false },
            },
            fields: "title,index,gridProperties.frozenRowCount,gridProperties.hideGridlines",
          },
        });
      } else {
        requests.push({
          addSheet: {
            properties: {
              title,
              index,
              gridProperties: { frozenRowCount: frozenRows(title), hideGridlines: false },
            },
          },
        });
      }
    });

    // Remove any charts we previously drew on the dashboards so re-adding
    // them below doesn't pile up duplicates. (Deleted tabs take their charts with them.)
    existing.sheets
      .filter((s) => titles.includes(s.properties.title) && isDashboard(s.properties.title))
      .forEach((sheet) => {
        sheet.charts?.forEach((chart) => {
          requests.push({ deleteEmbeddedObject: { objectId: chart.chartId } });
        });
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

  private async clearRanges(accessToken: string, spreadsheetId: string, titles: string[]) {
    await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchClear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ranges: titles.map(quoteTab) }),
    });
  }

  /**
   * Lays out the Dashboard top to bottom and records which row each block landed on, so the
   * formatting and charts never depend on hard-coded row numbers (the number of profiles varies).
   */
  private buildDashboard(data: ReturnType<SheetsWorkbookService["gatherData"]>) {
    const values: any[][] = [];
    const add = (row: any[] = []) => values.push(row) - 1;

    add(["Kakeibo Dashboard"]);
    add([`Last updated: ${new Date().toLocaleString()}`]);
    add([
      "A copy of your Kakeibo app data. To change transactions, edit the Transactions tab, then tap Pull in the app. Leave the ID blank when adding a new row.",
    ]);
    add();

    const glanceTitle = add(["At a glance"]);
    const glanceHeader = add(["Total balance", "Income this month", "Expenses this month", "Net this month", "Savings rate"]);
    const glanceValues = add([data.totalBalance, data.monthlyIncome, data.monthlyExpenses, data.net, data.savingsRate]);
    add();

    const profileTitle = add(["By profile"]);
    const profileHeader = add(["Profile", "Balance", "Income this month", "Expenses this month", "Net this month"]);
    const profileFirst = values.length;
    data.profileRows.forEach((p) => add([p.name, p.balance, p.income, p.expenses, p.net]));
    const profileEnd = values.length;
    // A total row only adds something when there is more than one profile to add up.
    const profileTotal =
      data.profileRows.length > 1
        ? add(["All profiles", data.totalBalance, data.monthlyIncome, data.monthlyExpenses, data.net])
        : null;
    add();

    const trendTitle = add(["Last 6 months"]);
    const trendHeader = add(["Month", "Income", "Expenses", "Net"]);
    const trendFirst = values.length;
    // The apostrophe stops Sheets from turning "Sep 2026" into a date.
    data.monthlyTrend.forEach((m) => add([`'${monthLabel(m.month)}`, m.income, m.expenses, m.income - m.expenses]));
    const trendEnd = values.length;
    add();

    // The charts float over the empty rows below this title, so they are always anchored
    // relative to the tables above them instead of at a fixed spot that can drift off-screen.
    const chartsTitle = add(["Charts"]);
    const chartsRow = chartsTitle + 1;

    return {
      values,
      rows: {
        glanceTitle,
        glanceHeader,
        glanceValues,
        profileTitle,
        profileHeader,
        profileFirst,
        profileEnd,
        profileTotal,
        trendTitle,
        trendHeader,
        trendFirst,
        trendEnd,
        chartsTitle,
        chartsRow,
      },
    };
  }

  /**
   * The same layout as the Dashboard, for a single profile: at a glance, the 6-month trend, this
   * month's spending by category (the pie chart reads it from this tab), its accounts, and charts.
   */
  private buildProfileDashboard(profile: ReturnType<SheetsWorkbookService["gatherData"]>["profileTabs"][number]) {
    const values: any[][] = [];
    const add = (row: any[] = []) => values.push(row) - 1;

    add([`Kakeibo Dashboard - ${profile.name}`]);
    add([`Last updated: ${new Date().toLocaleString()}`]);
    add([`This tab shows ${profile.name} only. The Dashboard tab has all profiles together. Edit transactions on the Transactions tab.`]);
    add();

    const glanceTitle = add(["At a glance"]);
    const glanceHeader = add(["Total balance", "Income this month", "Expenses this month", "Net this month", "Savings rate"]);
    const glanceValues = add([profile.balance, profile.income, profile.expenses, profile.net, profile.savingsRate]);
    add();

    const trendTitle = add(["Last 6 months"]);
    const trendHeader = add(["Month", "Income", "Expenses", "Net"]);
    const trendFirst = values.length;
    profile.monthlyTrend.forEach((m) => add([`'${monthLabel(m.month)}`, m.income, m.expenses, m.income - m.expenses]));
    const trendEnd = values.length;
    add();

    const categoryTitle = add(["Spending by category (this month)"]);
    const categoryHeader = add(["Category", "Spent this month", "% of total"]);
    const categoryFirst = values.length;
    profile.categorySummary.forEach((c) => add([c.category, c.amount, c.percentage]));
    const categoryEnd = values.length;
    if (categoryEnd === categoryFirst) add(["Nothing spent this month"]);
    add();

    const accountsTitle = add(["Accounts"]);
    const accountsHeader = add(["Account", "Type", "Balance"]);
    const accountsFirst = values.length;
    profile.accounts.forEach((a) => add([a.name, ACCOUNT_TYPE_LABELS[a.type] ?? a.type, a.balance]));
    const accountsEnd = values.length;
    if (accountsEnd === accountsFirst) add(["No accounts"]);
    add();

    // The charts float over the empty rows below this title, like on the Dashboard.
    const chartsTitle = add(["Charts"]);

    return {
      values,
      rows: {
        glanceTitle,
        glanceHeader,
        glanceValues,
        trendTitle,
        trendHeader,
        trendFirst,
        trendEnd,
        categoryTitle,
        categoryHeader,
        categoryFirst,
        categoryEnd,
        accountsTitle,
        accountsHeader,
        accountsFirst,
        accountsEnd,
        chartsTitle,
        chartsRow: chartsTitle + 1,
      },
    };
  }

  private async writeData(
    accessToken: string,
    spreadsheetId: string,
    data: ReturnType<SheetsWorkbookService["gatherData"]>,
    dashboard: ReturnType<SheetsWorkbookService["buildDashboard"]>,
    profileDashboards: Array<ReturnType<SheetsWorkbookService["buildProfileDashboard"]>>,
  ) {
    const transactionsValues = [
      ["ID", "Date", "Type", "Category", "Amount", "Description", "Payment method", "Account", "Profile"],
      ...data.transactions.map((t) => [
        t.id,
        t.date,
        t.type,
        t.category,
        t.amount,
        t.description,
        t.paymentMethod,
        t.accountId != null ? (data.accountNameById.get(t.accountId) ?? "") : "",
        data.profileNameById.get(t.profileId) ?? "",
      ]),
    ];

    const accountsValues = [
      ["Profile", "Account", "Type", "Balance", "Currency", "Notes"],
      ...data.accounts.map((a) => [
        data.profileNameById.get(a.profileId) ?? "",
        a.name,
        ACCOUNT_TYPE_LABELS[a.type] ?? a.type,
        a.balance,
        a.currency,
        a.type === "loan"
          ? `${a.isLending ? "Lent to" : "Borrowed from"} ${a.loanCounterpartyName || "?"}${a.loanTermMonths ? ` (${a.loanInterestRate || 0}% for ${a.loanTermMonths} months)` : ""}`
          : a.bankName || "",
      ]),
    ];

    const categoriesValues = [
      ["Category", "Spent this month", "% of total"],
      ...data.categorySummary.map((c) => [c.category, c.amount, c.percentage]),
    ];

    const response = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: [
          { range: TAB.DASHBOARD, values: dashboard.values },
          ...data.profileTabs.map((profile, index) => ({ range: quoteTab(profile.title), values: profileDashboards[index].values })),
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
    dashboard: ReturnType<SheetsWorkbookService["buildDashboard"]>,
    profileDashboards: Array<ReturnType<SheetsWorkbookService["buildProfileDashboard"]>>,
    hasTransactionFilter: boolean,
    hadBlackTheme: boolean,
    hadDarkCells: boolean,
  ) {
    const requests: any[] = [];

    // Range helpers. Leaving the end row/column out means "to the end of the sheet", which is
    // what we want for anything the user might extend by typing new rows.
    const range = (sheetId: number, r0: number, r1: number | undefined, c0: number, c1: number) => ({
      sheetId,
      startRowIndex: r0,
      endRowIndex: r1,
      startColumnIndex: c0,
      endColumnIndex: c1,
    });

    const format = (r: ReturnType<typeof range>, userEnteredFormat: object, fields: string) => ({
      repeatCell: { range: r, cell: { userEnteredFormat }, fields },
    });

    const headerRow = (sheetId: number, row: number, columnCount: number) =>
      format(range(sheetId, row, row + 1, 0, columnCount), HEADER_FORMAT, "userEnteredFormat(backgroundColor,textFormat)");

    // Section titles are bold with an amber underline (no filled band, which would not adapt to a dark theme).
    const sectionRow = (sheetId: number, row: number) => [
      format(range(sheetId, row, row + 1, 0, 5), { textFormat: SECTION_TEXT }, "userEnteredFormat.textFormat"),
      { updateBorders: { range: range(sheetId, row, row + 1, 0, 5), bottom: { style: "SOLID_MEDIUM", colorStyle: { rgbColor: AMBER } } } },
    ];

    const number = (r: ReturnType<typeof range>, type: "NUMBER" | "PERCENT" | "DATE", pattern: string) =>
      format(r, { numberFormat: { type, pattern } }, "userEnteredFormat.numberFormat");

    const columnWidth = (sheetId: number, column: number, pixelSize: number) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: column, endIndex: column + 1 },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    });

    const rowHeight = (sheetId: number, row: number, pixelSize: number) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: "ROWS", startIndex: row, endIndex: row + 1 },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    });

    const colorRule = (ranges: Array<ReturnType<typeof range>>, condition: object, color: object) => ({
      addConditionalFormatRule: {
        rule: { ranges, booleanRule: { condition, format: { textFormat: { foregroundColor: color } } } },
        index: 0,
      },
    });

    // Negative numbers red, zero or positive green.
    const redGreen = (ranges: Array<ReturnType<typeof range>>) => [
      colorRule(ranges, { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] }, RED),
      colorRule(ranges, { type: "NUMBER_GREATER_THAN_EQ", values: [{ userEnteredValue: "0" }] }, GREEN),
    ];

    const dropdown = (sheetId: number, column: number, options: string[]) => ({
      setDataValidation: {
        range: range(sheetId, 1, undefined, column, column + 1),
        rule: {
          condition: { type: "ONE_OF_LIST", values: options.map((userEnteredValue) => ({ userEnteredValue })) },
          showCustomUi: true,
          strict: false, // flag odd values instead of refusing them
        },
      },
    });

    // The Dashboard, Accounts and Categories tabs are generated from scratch each time, so wipe
    // their formatting first - otherwise colors and merges from a previous layout linger.
    const dashSheetId = sheetIds[TAB.DASHBOARD];
    const acctSheetId = sheetIds[TAB.ACCOUNTS];
    const catSheetId = sheetIds[TAB.CATEGORIES];
    const txSheetId = sheetIds[TAB.TRANSACTIONS];
    const profileSheetIds = data.profileTabs.map((profile) => sheetIds[profile.title]);
    [dashSheetId, acctSheetId, catSheetId, ...profileSheetIds].forEach((sheetId) => {
      requests.push({ repeatCell: { range: { sheetId }, cell: {}, fields: "userEnteredFormat" } });
    });

    // One-time cleanups for spreadsheets that were forced dark by an earlier version.
    if (hadBlackTheme) {
      requests.push({
        updateSpreadsheetProperties: { properties: { spreadsheetTheme: DEFAULT_SPREADSHEET_THEME }, fields: "spreadsheetTheme" },
      });
    }
    // Transactions is normally left alone so formatting you add there survives a sync, but here its
    // forced background, text color and borders have to go so it can follow the viewer's theme again.
    if (hadDarkCells) {
      requests.push({
        repeatCell: {
          range: { sheetId: txSheetId },
          cell: {},
          fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.foregroundColor",
        },
      });
      const noBorder = { style: "NONE" };
      requests.push({
        updateBorders: { range: { sheetId: txSheetId }, top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, innerHorizontal: noBorder, innerVertical: noBorder },
      });
    }
    [dashSheetId, ...profileSheetIds].forEach((sheetId) => requests.push({ unmergeCells: { range: { sheetId } } }));

    // --- Transactions sheet ---
    requests.push(headerRow(txSheetId, 0, 9));
    [50, 100, 80, 120, 100, 240, 120, 170, 110].forEach((pixels, column) => requests.push(columnWidth(txSheetId, column, pixels)));
    requests.push(format(range(txSheetId, 1, undefined, 0, 1), { textFormat: { foregroundColor: MUTED } }, "userEnteredFormat.textFormat.foregroundColor")); // ID: needed for sync, not for reading
    requests.push(number(range(txSheetId, 1, undefined, 1, 2), "DATE", "yyyy-mm-dd")); // ISO so Pull can read it back
    requests.push(number(range(txSheetId, 1, undefined, 4, 5), "NUMBER", MONEY));
    requests.push(colorRule([range(txSheetId, 1, undefined, 4, 5)], { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=$C2="expense"' }] }, RED));
    requests.push(colorRule([range(txSheetId, 1, undefined, 4, 5)], { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=$C2="income"' }] }, GREEN));

    // Dropdowns make adding a row in the sheet a matter of picking values instead of typing exact names.
    requests.push(dropdown(txSheetId, 2, ["income", "expense"]));
    if (data.categoryNames.length > 0) requests.push(dropdown(txSheetId, 3, data.categoryNames));
    requests.push(dropdown(txSheetId, 6, ["cash", "credit_card", "debit_card"]));
    const accountNames = Array.from(new Set(data.accounts.map((a) => a.name)));
    if (accountNames.length > 0) requests.push(dropdown(txSheetId, 7, accountNames));
    const profileNames = data.profileRows.map((p) => p.name);
    if (profileNames.length > 0) requests.push(dropdown(txSheetId, 8, profileNames));

    if (!hasTransactionFilter) {
      requests.push({ setBasicFilter: { filter: { range: range(txSheetId, 0, undefined, 0, 9) } } });
    }

    // --- Accounts sheet ---
    requests.push(headerRow(acctSheetId, 0, 6));
    [110, 180, 110, 110, 80, 220].forEach((pixels, column) => requests.push(columnWidth(acctSheetId, column, pixels)));
    requests.push(number(range(acctSheetId, 1, undefined, 3, 4), "NUMBER", MONEY));
    requests.push(colorRule([range(acctSheetId, 1, undefined, 3, 4)], { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] }, RED));

    // --- Categories sheet ---
    requests.push(headerRow(catSheetId, 0, 3));
    [160, 140, 100].forEach((pixels, column) => requests.push(columnWidth(catSheetId, column, pixels)));
    requests.push(number(range(catSheetId, 1, undefined, 1, 2), "NUMBER", MONEY));
    requests.push(number(range(catSheetId, 1, undefined, 2, 3), "PERCENT", "0.0%"));

    // --- Dashboard sheet ---
    const r = dashboard.rows;
    const columnCount = 5;

    requests.push({ mergeCells: { range: range(dashSheetId, 0, 1, 0, columnCount), mergeType: "MERGE_ALL" } });
    requests.push(format(range(dashSheetId, 0, 1, 0, columnCount), { textFormat: { bold: true, fontSize: 18 } }, "userEnteredFormat.textFormat"));
    requests.push(format(range(dashSheetId, 1, 2, 0, columnCount), { textFormat: { italic: true, foregroundColor: MUTED } }, "userEnteredFormat.textFormat"));

    requests.push({ mergeCells: { range: range(dashSheetId, 2, 3, 0, columnCount), mergeType: "MERGE_ALL" } });
    requests.push(
      format(
        range(dashSheetId, 2, 3, 0, columnCount),
        { textFormat: { italic: true, foregroundColor: MUTED }, wrapStrategy: "WRAP", verticalAlignment: "TOP" },
        "userEnteredFormat(textFormat,wrapStrategy,verticalAlignment)",
      ),
    );
    requests.push(rowHeight(dashSheetId, 2, 40));

    [r.glanceTitle, r.profileTitle, r.trendTitle, r.chartsTitle].forEach((row) => requests.push(...sectionRow(dashSheetId, row)));
    requests.push(headerRow(dashSheetId, r.glanceHeader, 5));
    requests.push(headerRow(dashSheetId, r.profileHeader, 5));
    requests.push(headerRow(dashSheetId, r.trendHeader, 4));

    // At a glance: big numbers, money in the first four, a percentage in the last.
    const bigNumber = { textFormat: { bold: true, fontSize: 14 } };
    requests.push(format(range(dashSheetId, r.glanceValues, r.glanceValues + 1, 0, 4), { ...bigNumber, numberFormat: { type: "NUMBER", pattern: MONEY } }, "userEnteredFormat(numberFormat,textFormat)"));
    requests.push(format(range(dashSheetId, r.glanceValues, r.glanceValues + 1, 4, 5), { ...bigNumber, numberFormat: { type: "PERCENT", pattern: "0%" } }, "userEnteredFormat(numberFormat,textFormat)"));
    requests.push(rowHeight(dashSheetId, r.glanceValues, 32));

    // By profile / trend tables.
    if (r.profileEnd > r.profileFirst) {
      requests.push(number(range(dashSheetId, r.profileFirst, r.profileEnd, 1, 5), "NUMBER", MONEY));
    }
    if (r.profileTotal !== null) {
      requests.push(
        format(
          range(dashSheetId, r.profileTotal, r.profileTotal + 1, 0, 5),
          { textFormat: { bold: true }, numberFormat: { type: "NUMBER", pattern: MONEY } },
          "userEnteredFormat(textFormat,numberFormat)",
        ),
      );
      requests.push({
        updateBorders: { range: range(dashSheetId, r.profileTotal, r.profileTotal + 1, 0, 5), top: { style: "SOLID", colorStyle: { rgbColor: MUTED } } },
      });
    }
    if (r.trendEnd > r.trendFirst) {
      requests.push(number(range(dashSheetId, r.trendFirst, r.trendEnd, 1, 4), "NUMBER", MONEY));
    }

    const profileLastRow = r.profileTotal !== null ? r.profileTotal + 1 : r.profileEnd;

    // Red/green: net + savings rate, each profile's balance and net, and the trend's net column.
    redGreen([
      range(dashSheetId, r.glanceValues, r.glanceValues + 1, 3, 5),
      range(dashSheetId, r.profileFirst, profileLastRow, 1, 2),
      range(dashSheetId, r.profileFirst, profileLastRow, 4, 5),
      range(dashSheetId, r.trendFirst, r.trendEnd, 3, 4),
    ]).forEach((rule) => requests.push(rule));

    [200, 160, 160, 160, 160].forEach((pixels, column) => requests.push(columnWidth(dashSheetId, column, pixels)));

    // Charts sit side by side under the tables, inside their 840px width (200 + 4 x 160), so
    // they are visible without horizontal scrolling. Each is 410px wide with a 20px gap.
    const chartHeight = 280;
    const addDashboardCharts = (chart: {
      sheetId: number;
      chartsRow: number;
      trend: { header: number; first: number; end: number };
      category: { sheetId: number; first: number; end: number };
    }) => {
      const chartPosition = (offsetXPixels: number) => ({
        overlayPosition: {
          anchorCell: { sheetId: chart.sheetId, rowIndex: chart.chartsRow, columnIndex: 0 },
          offsetXPixels,
          offsetYPixels: 8,
          widthPixels: 410,
          heightPixels: chartHeight,
        },
      });

      if (chart.trend.end > chart.trend.first) {
        const source = (column: number) => ({
          sourceRange: { sources: [range(chart.sheetId, chart.trend.header, chart.trend.end, column, column + 1)] },
        });
        requests.push({
          addChart: {
            chart: {
              spec: {
                title: "Income vs Expenses (last 6 months)",
                basicChart: {
                  chartType: "COLUMN",
                  legendPosition: "BOTTOM_LEGEND",
                  axis: [{ position: "BOTTOM_AXIS" }, { position: "LEFT_AXIS" }],
                  domains: [{ domain: source(0) }],
                  series: [
                    { series: source(1), targetAxis: "LEFT_AXIS", colorStyle: { rgbColor: GREEN } },
                    { series: source(2), targetAxis: "LEFT_AXIS", colorStyle: { rgbColor: RED } },
                  ],
                  headerCount: 1,
                },
              },
              position: chartPosition(0),
            },
          },
        });
      }

      if (chart.category.end > chart.category.first) {
        const source = (column: number) => ({
          sourceRange: { sources: [range(chart.category.sheetId, chart.category.first, chart.category.end, column, column + 1)] },
        });
        requests.push({
          addChart: {
            chart: {
              spec: {
                title: "Spending by category (this month)",
                pieChart: { legendPosition: "RIGHT_LEGEND", domain: source(0), series: source(1) },
              },
              position: chartPosition(430),
            },
          },
        });
      }
    };

    addDashboardCharts({
      sheetId: dashSheetId,
      chartsRow: r.chartsRow,
      trend: { header: r.trendHeader, first: r.trendFirst, end: r.trendEnd },
      // The Categories tab holds the header on row 0, so its data rows are 1..n.
      category: { sheetId: catSheetId, first: 1, end: data.categorySummary.length + 1 },
    });

    // --- One dashboard tab per profile: same look as the Dashboard, for that profile only ---
    data.profileTabs.forEach((profile, index) => {
      const sheetId = sheetIds[profile.title];
      const pr = profileDashboards[index].rows;

      requests.push({ mergeCells: { range: range(sheetId, 0, 1, 0, columnCount), mergeType: "MERGE_ALL" } });
      requests.push(format(range(sheetId, 0, 1, 0, columnCount), { textFormat: { bold: true, fontSize: 18 } }, "userEnteredFormat.textFormat"));
      requests.push(format(range(sheetId, 1, 3, 0, columnCount), { textFormat: { italic: true, foregroundColor: MUTED } }, "userEnteredFormat.textFormat"));

      [pr.glanceTitle, pr.trendTitle, pr.categoryTitle, pr.accountsTitle, pr.chartsTitle].forEach((row) => requests.push(...sectionRow(sheetId, row)));
      requests.push(headerRow(sheetId, pr.glanceHeader, 5));
      requests.push(headerRow(sheetId, pr.trendHeader, 4));
      requests.push(headerRow(sheetId, pr.categoryHeader, 3));
      requests.push(headerRow(sheetId, pr.accountsHeader, 3));

      requests.push(format(range(sheetId, pr.glanceValues, pr.glanceValues + 1, 0, 4), { ...bigNumber, numberFormat: { type: "NUMBER", pattern: MONEY } }, "userEnteredFormat(numberFormat,textFormat)"));
      requests.push(format(range(sheetId, pr.glanceValues, pr.glanceValues + 1, 4, 5), { ...bigNumber, numberFormat: { type: "PERCENT", pattern: "0%" } }, "userEnteredFormat(numberFormat,textFormat)"));
      requests.push(rowHeight(sheetId, pr.glanceValues, 32));

      if (pr.trendEnd > pr.trendFirst) requests.push(number(range(sheetId, pr.trendFirst, pr.trendEnd, 1, 4), "NUMBER", MONEY));
      if (pr.categoryEnd > pr.categoryFirst) {
        requests.push(number(range(sheetId, pr.categoryFirst, pr.categoryEnd, 1, 2), "NUMBER", MONEY));
        requests.push(number(range(sheetId, pr.categoryFirst, pr.categoryEnd, 2, 3), "PERCENT", "0.0%"));
      }
      if (pr.accountsEnd > pr.accountsFirst) {
        requests.push(number(range(sheetId, pr.accountsFirst, pr.accountsEnd, 2, 3), "NUMBER", MONEY));
        requests.push(colorRule([range(sheetId, pr.accountsFirst, pr.accountsEnd, 2, 3)], { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] }, RED));
      }

      redGreen([
        range(sheetId, pr.glanceValues, pr.glanceValues + 1, 3, 5),
        range(sheetId, pr.trendFirst, pr.trendEnd, 3, 4),
      ]).forEach((rule) => requests.push(rule));

      [200, 160, 160, 160, 160].forEach((pixels, column) => requests.push(columnWidth(sheetId, column, pixels)));

      addDashboardCharts({
        sheetId,
        chartsRow: pr.chartsRow,
        trend: { header: pr.trendHeader, first: pr.trendFirst, end: pr.trendEnd },
        category: { sheetId, first: pr.categoryFirst, end: pr.categoryEnd },
      });
    });

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
