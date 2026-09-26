/**
 * Extracts spend transactions from a statement PDF's already-decoded text, for reconciliation
 * against what's already logged in Kakeibo (see database/StatementService.ts) - nothing here
 * writes to the database or touches the filesystem/network, so it can be exercised with plain
 * arrays of text items in isolation.
 *
 * This ports the two strategies validated in scripts/parse-statement.mjs against real statements:
 *  - "table": a bordered table with a header row (bank card statements). Column boundaries are
 *    derived from the DATA rows themselves (see clusterByGaps) rather than the header labels'
 *    x-position, which can be padded/centred differently from where the data actually starts.
 *  - "card-list": a UPI/payments-app-style export with no header row at all. Each entry is a
 *    "₹"-anchored name+amount row followed by a date line.
 * The caller tries "table" first and falls back to "card-list" if it finds nothing - see
 * extractStatementTransactions.
 */

/** The subset of a pdfjs TextItem this module actually reads: its string and its position. */
export interface StatementTextItem {
  str: string;
  transform: number[]; // [a, b, c, d, x, y] - only x (index 4) and y (index 5) are used
}

export interface StatementRow {
  y: number;
  items: Array<{ x: number; text: string }>;
}

export interface ParsedStatementTransaction {
  date: string; // ISO "YYYY-MM-DD"
  description: string | null;
  amount: number;
  direction: 'debit' | 'credit';
}

export type StatementParseStrategy = 'table' | 'card-list' | 'none';

const Y_TOLERANCE = 2.5; // points; items within this y-distance are treated as the same row

export function groupIntoRows(items: StatementTextItem[]): StatementRow[] {
  // PDF y-origin is bottom-left, so larger y = higher on the page; sort top-to-bottom.
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
  const rows: StatementRow[] = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const x = item.transform[4];
    const text = item.str;
    if (!text || !text.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (row) {
      row.items.push({ x, text });
      row.y = (row.y + y) / 2;
    } else {
      rows.push({ y, items: [{ x, text }] });
    }
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}

// --- Table strategy -------------------------------------------------------------------------

type ColumnType = 'date' | 'description' | 'category' | 'amount' | 'cashback';

// Tested against EACH cell's own text (not the whole joined row) - a header cell is one short
// label like "DATE" or "AMOUNT (Rs.)", not a sentence, so anchoring ^...$ only matches real
// header labels and not a transaction row that happens to contain "Cr"/"Dr".
const COLUMN_MATCHERS: Array<{ type: ColumnType; re: RegExp }> = [
  { type: 'date', re: /^(txn\.?|transaction|value)?\s*date$/i },
  { type: 'description', re: /^(transaction\s*details|narration|description|particulars|details)$/i },
  { type: 'category', re: /^(merchant\s*)?category$/i },
  { type: 'amount', re: /^amount/i },
  { type: 'cashback', re: /^cashback/i },
];

const MIN_HEADER_COLUMN_MATCHES = 3; // avoids false positives from unrelated 2-column mini-tables

function stripForHeaderMatch(text: string): string {
  return text.replace(/[().,]/g, '').trim();
}

function matchHeaderColumns(row: StatementRow): Array<{ type: ColumnType; x: number }> {
  const found: Array<{ type: ColumnType; x: number }> = [];
  for (const item of row.items) {
    const cleaned = stripForHeaderMatch(item.text);
    const match = COLUMN_MATCHERS.find((c) => c.re.test(cleaned));
    if (match) found.push({ type: match.type, x: item.x });
  }
  return found;
}

// A real transaction's amount cell always carries a Dr/Cr suffix on these statements; a
// same-shaped row that lacks it (e.g. an EMI outstanding-balance summary line) isn't a spend.
const AMOUNT_WITH_DIRECTION = /^([\d,]+\.\d{2})\s*(Dr|Cr)$/i;

const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DATE_LIKE = /\d{1,2}[\s\-/][A-Za-z0-9]{2,9}[\s\-/]'?\d{2,4}/;

function normalizeSlashDate(text: string): string | null {
  // These statements print dates as DD/MM/YYYY (Indian bank convention), not MM/DD/YYYY.
  const m = SLASH_DATE.exec(text.trim());
  if (!m) return null;
  const [, day, month, year] = m;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Splits x-positions into `k` groups by cutting at the k-1 largest gaps between consecutive
 * sorted values. Table columns are visually separated by whitespace, so real column boundaries
 * show up as the biggest gaps - this works even when a column's own items vary in x (e.g. a
 * right-aligned amount column, where longer numbers start further left), as long as that
 * variation is smaller than the gap between columns, which holds for these statements.
 */
function clusterByGaps(xs: number[], k: number): number[][] {
  const sorted = [...xs].sort((a, b) => a - b);
  if (k <= 1 || sorted.length <= k) return [sorted];
  const gapSizes = sorted.slice(1).map((x, i) => ({ at: i + 1, size: x - sorted[i] }));
  const cuts = gapSizes
    .sort((a, b) => b.size - a.size)
    .slice(0, k - 1)
    .map((g) => g.at)
    .sort((a, b) => a - b);
  const clusters: number[][] = [];
  let start = 0;
  for (const cut of cuts) {
    clusters.push(sorted.slice(start, cut));
    start = cut;
  }
  clusters.push(sorted.slice(start));
  return clusters;
}

/**
 * Groups a page's rows into table blocks (header row -> "end of statement"), derives each
 * block's real column x-boundaries from its own data, then buckets every cell into the nearest
 * column and keeps only rows that look like a real transaction: a date-shaped date cell and a
 * Dr/Cr-suffixed amount cell. Stops entirely once "end of statement" is seen and reports that via
 * `ended`, since real transactions never resume after it (an unrelated mini-table elsewhere in the
 * PDF could otherwise be mistaken for a real header).
 */
function extractTableTransactionsFromPage(rows: StatementRow[]): {
  transactions: ParsedStatementTransaction[];
  ended: boolean;
} {
  const transactions: ParsedStatementTransaction[] = [];
  let columnTypes: ColumnType[] | null = null;
  let blockRows: StatementRow[] = [];

  const flushBlock = () => {
    if (!columnTypes || blockRows.length === 0) {
      blockRows = [];
      return;
    }
    const items = blockRows.flatMap((r) => r.items);
    const clusters = clusterByGaps(items.map((i) => i.x), columnTypes.length);
    const centroids = clusters.map((c) => c.reduce((a, b) => a + b, 0) / (c.length || 1));

    for (const row of blockRows) {
      const cells: Partial<Record<ColumnType, string>> = {};
      for (const item of row.items) {
        let best = 0;
        let bestDist = Infinity;
        centroids.forEach((c, i) => {
          const dist = Math.abs(item.x - c);
          if (dist < bestDist) {
            best = i;
            bestDist = dist;
          }
        });
        const type = columnTypes![best];
        cells[type] = cells[type] ? `${cells[type]} ${item.text}` : item.text;
      }

      if (!cells.date || !DATE_LIKE.test(cells.date)) continue;
      const isoDate = normalizeSlashDate(cells.date);
      if (!isoDate) continue;
      const amountMatch = cells.amount && AMOUNT_WITH_DIRECTION.exec(cells.amount.trim());
      if (!amountMatch) continue;

      transactions.push({
        date: isoDate,
        description: [cells.description, cells.category].filter(Boolean).join(' - ') || null,
        amount: parseFloat(amountMatch[1].replace(/,/g, '')),
        direction: amountMatch[2].toLowerCase() === 'dr' ? 'debit' : 'credit',
      });
    }
    blockRows = [];
  };

  let ended = false;
  for (const row of rows) {
    const rowText = row.items.map((i) => i.text).join(' ');
    if (/end of statement/i.test(rowText)) {
      flushBlock();
      ended = true;
      break;
    }
    const headerCols = matchHeaderColumns(row);
    if (headerCols.length >= MIN_HEADER_COLUMN_MATCHES) {
      flushBlock();
      columnTypes = headerCols.map((c) => c.type);
      continue;
    }
    if (!columnTypes) continue;
    blockRows.push(row);
  }
  if (!ended) flushBlock();

  return { transactions, ended };
}

// --- Card-list strategy ----------------------------------------------------------------------

// e.g. "20 Sep '26 • UPI" - the trailing "• METHOD" is optional, since some sections of a card-list
// statement (bank transfers, cashback) print a bare date with no method at all.
const CARD_LIST_DATE_LINE = /^(\d{1,2})\s+([A-Za-z]{3,9})\s*'?(\d{2,4})(\s*[••-]\s*(.+))?$/;

const MONTH_INDEX: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function normalizeCardListDate(day: string, monthName: string, year: string): string | null {
  const month = MONTH_INDEX[monthName.slice(0, 3).toLowerCase()];
  if (!month) return null;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month}-${day.padStart(2, '0')}`;
}

/** A card-list entry, with the section heading (e.g. "Spends", "Cashback") it was found under. */
export interface CardListEntry extends ParsedStatementTransaction {
  section: string | null;
}

/**
 * Extracts transactions from a card/list layout (e.g. a UPI app's "Spends" export): each entry is
 * a name+amount row (identified by a literal "₹" item, not by position - this format has no
 * header/columns to anchor on), an optional single-letter avatar row to ignore, then a date row
 * that completes it. Unlike the table format, x-positions here are stable for the whole document,
 * so all pages' rows are scanned as one continuous stream instead of resetting per page. A
 * standalone short row before an entry (e.g. "Spends", "Cashback") is recorded as its section,
 * since a section like Cashback/Refunds represents money coming back rather than a spend.
 */
function extractCardListTransactionsWithSections(rows: StatementRow[]): CardListEntry[] {
  const entries: CardListEntry[] = [];
  let currentSection: string | null = null;
  let pending: { name: string; amount: number } | null = null;

  // Sections whose amounts represent money coming back to you rather than a spend.
  const CREDIT_SECTIONS = /^(cashback|refunds?(\s*&\s*repayments?)?)$/i;

  for (const row of rows) {
    const texts = row.items.map((i) => i.text);
    const rowText = texts.join(' ').trim();

    const rupeeIndex = texts.indexOf('₹');
    if (rupeeIndex !== -1) {
      const name = texts[0];
      const amount = parseFloat(texts.slice(rupeeIndex + 1).join('').replace(/,/g, ''));
      if (name && !Number.isNaN(amount)) pending = { name, amount };
      continue;
    }

    if (texts.length === 1 && texts[0].trim().length === 1) continue; // avatar initial

    const dateMatch = CARD_LIST_DATE_LINE.exec(rowText);
    if (dateMatch) {
      if (pending) {
        const [, day, monthName, year] = dateMatch;
        const isoDate = normalizeCardListDate(day, monthName, year);
        if (isoDate) {
          entries.push({
            section: currentSection,
            date: isoDate,
            description: pending.name,
            amount: pending.amount,
            direction: currentSection && CREDIT_SECTIONS.test(currentSection) ? 'credit' : 'debit',
          });
        }
        pending = null;
      }
      continue;
    }

    if (texts.length === 1 && rowText.length > 0 && rowText.length < 40) {
      currentSection = rowText;
    }
  }

  return entries;
}

// --- Orchestrator ----------------------------------------------------------------------------

/**
 * Tries the table strategy across all pages first (stopping once "end of statement" is seen), and
 * falls back to the card-list strategy over every page's rows if the table strategy found nothing.
 */
export function extractStatementTransactions(pagesItems: StatementTextItem[][]): {
  strategy: StatementParseStrategy;
  transactions: ParsedStatementTransaction[];
} {
  const allRowsInOrder: StatementRow[] = [];
  const tableTransactions: ParsedStatementTransaction[] = [];
  let tableEnded = false;

  for (const items of pagesItems) {
    const rows = groupIntoRows(items);
    allRowsInOrder.push(...rows);
    if (tableEnded) continue;
    const { transactions, ended } = extractTableTransactionsFromPage(rows);
    tableTransactions.push(...transactions);
    if (ended) tableEnded = true;
  }

  if (tableTransactions.length > 0) {
    return { strategy: 'table', transactions: tableTransactions };
  }

  const cardListTransactions = extractCardListTransactionsWithSections(allRowsInOrder);
  if (cardListTransactions.length > 0) {
    return {
      strategy: 'card-list',
      transactions: cardListTransactions.map(({ section, ...t }) => t),
    };
  }

  return { strategy: 'none', transactions: [] };
}
