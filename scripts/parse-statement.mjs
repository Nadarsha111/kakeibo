#!/usr/bin/env node
/**
 * Local prototype for statement-PDF text extraction. Run this on your own machine against a real
 * statement PDF to see how pdfjs-dist reconstructs it into rows/columns, WITHOUT sending the file
 * anywhere - everything happens locally. Share the printed output (redact amounts/names further if
 * you like) so the real parser rules in the app can be tuned to your actual bank formats.
 *
 * Usage:
 *   node scripts/parse-statement.mjs <path-to-pdf> [password] [--page N] [--all]
 *   node scripts/parse-statement.mjs <path-to-pdf> [password] --extract [--all]
 *
 * By default only the first 5 pages are printed (statements can be long); pass --page N for just
 * one page, or --all for every page. --extract switches to structured-transaction mode: it finds
 * the table header on each page, buckets every cell into the nearest header column by x-position,
 * and prints the resulting transactions as JSON instead of raw rows.
 */
import { readFileSync } from "node:fs";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

// pdfjs's Node "fake worker" loader does a dynamic import() of this, which needs a real file://
// URL string (not a raw Windows path) - import.meta.resolve() already returns one.
GlobalWorkerOptions.workerSrc = import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

const Y_TOLERANCE = 2.5; // points; items within this y-distance are treated as the same row

// Tested against EACH cell's own text (not the whole joined row) - a header cell is one short label
// like "DATE" or "AMOUNT (Rs.)", not a sentence, so anchoring ^...$ (with punctuation stripped) only
// matches real header labels and not transaction rows that happen to contain "Cr"/"Dr".
const COLUMN_MATCHERS = [
  { type: "date", re: /^(txn\.?|transaction|value)?\s*date$/i },
  { type: "description", re: /^(transaction\s*details|narration|description|particulars|details)$/i },
  { type: "category", re: /^(merchant\s*)?category$/i },
  { type: "amount", re: /^amount/i },
  { type: "cashback", re: /^cashback/i },
];

function stripForHeaderMatch(text) {
  return text.replace(/[().,]/g, "").trim();
}

// e.g. "20 Sep '26 . UPI" / "18-09-2026 - NEFT" - the card/list layout's per-transaction anchor line
const DATE_ANCHOR = /\b\d{1,2}[\s\-/]([A-Za-z]{3,9}|\d{1,2})[\s\-/]'?\d{2,4}\b.{0,10}\b(UPI|NEFT|IMPS|POS|ATM|CARD|RTGS)\b/i;

// Same date shape as DATE_ANCHOR, but the trailing "• METHOD" is optional - some sections of a
// card-list statement (e.g. bank transfers, cashback) print a bare date with no method at all.
const CARD_LIST_DATE_LINE = /^\d{1,2}\s+[A-Za-z]{3,9}\s*'?\d{2,4}(\s*[••-]\s*(.+))?$/;

// A real transaction's amount cell always carries a Cr/Dr suffix on these statements; a same-shaped
// row that lacks it (e.g. an "EMI BALANCES" outstanding-balance line) isn't a spend for the month.
const AMOUNT_WITH_DIRECTION = /^([\d,]+\.\d{2})\s*(Dr|Cr)$/i;

const DATE_LIKE = /\d{1,2}[\s\-/][A-Za-z0-9]{2,9}[\s\-/]'?\d{2,4}/;

function parseArgs(argv) {
  const args = { file: null, password: undefined, page: null, all: false, extract: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") args.all = true;
    else if (a === "--extract") args.extract = true;
    else if (a === "--page") args.page = parseInt(argv[++i], 10);
    else if (!args.file) args.file = a;
    else if (args.password === undefined) args.password = a;
  }
  return args;
}

function groupIntoRows(items) {
  // PDF y-origin is bottom-left, so larger y = higher on the page; sort top-to-bottom.
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5]);
  const rows = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const x = item.transform[4];
    const text = item.str;
    if (!text || !text.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (row) {
      row.items.push({ x, text });
      row.y = (row.y + y) / 2; // recentre slightly as more items join
    } else {
      rows.push({ y, items: [{ x, text }] });
    }
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  return rows;
}

/** Which column each item in a row looks like a header label for, e.g. [{type: "date", x: 47.5}, ...] */
function matchHeaderColumns(row) {
  const found = [];
  for (const item of row.items) {
    const cleaned = stripForHeaderMatch(item.text);
    const match = COLUMN_MATCHERS.find((c) => c.re.test(cleaned));
    if (match) found.push({ type: match.type, x: item.x });
  }
  return found;
}

const MIN_HEADER_COLUMN_MATCHES = 3; // avoids false positives from unrelated 2-column mini-tables

function rowFlags(row) {
  const rowText = row.items.map((i) => i.text).join(" ");
  const flags = [];
  if (matchHeaderColumns(row).length >= MIN_HEADER_COLUMN_MATCHES) flags.push("HEADER?");
  if (DATE_ANCHOR.test(rowText)) flags.push("DATE-ANCHOR?");
  return flags;
}

function printRow(row) {
  const flags = rowFlags(row);
  const flagStr = flags.length ? `  [${flags.join(", ")}]` : "";
  console.log(`y=${row.y.toFixed(1).padStart(7)}${flagStr}`);
  for (const item of row.items) {
    console.log(`    x=${item.x.toFixed(1).padStart(7)}  "${item.text}"`);
  }
}

/**
 * Splits x-positions into `k` groups by cutting at the k-1 largest gaps between consecutive
 * sorted values. Table columns are visually separated by whitespace, so real column boundaries
 * show up as the biggest gaps - this works even when a column's own items vary in x (e.g. a
 * right-aligned amount column, where longer numbers start further left), as long as that
 * variation is smaller than the gap between columns, which holds for these statements.
 */
function clusterByGaps(xs, k) {
  const sorted = [...xs].sort((a, b) => a - b);
  if (k <= 1 || sorted.length <= k) return [sorted];
  const gapSizes = [];
  for (let i = 1; i < sorted.length; i++) gapSizes.push({ at: i, size: sorted[i] - sorted[i - 1] });
  const cuts = gapSizes
    .sort((a, b) => b.size - a.size)
    .slice(0, k - 1)
    .map((g) => g.at)
    .sort((a, b) => a - b);
  const clusters = [];
  let start = 0;
  for (const cut of cuts) {
    clusters.push(sorted.slice(start, cut));
    start = cut;
  }
  clusters.push(sorted.slice(start));
  return clusters;
}

/**
 * Groups a page's rows into table blocks (header row -> "end of statement" or the next header),
 * derives each block's real column x-boundaries from its own data (see clusterByGaps), then
 * buckets every cell into the nearest column and keeps only rows that look like a real
 * transaction: a date-shaped date cell and a Dr/Cr-suffixed amount cell (a same-shaped row
 * without that suffix, e.g. an EMI outstanding-balance summary line, is not a spend for the month).
 */
function extractTransactionsFromPage(rows) {
  const transactions = [];
  const skippedNonTransactionRows = [];

  let columnTypes = null; // left-to-right column meanings from the header, e.g. ["date", "description", ...]
  let blockRows = [];

  const flushBlock = () => {
    if (!columnTypes || blockRows.length === 0) {
      blockRows = [];
      return;
    }
    const items = blockRows.flatMap((r) => r.items);
    const clusters = clusterByGaps(
      items.map((i) => i.x),
      columnTypes.length,
    );
    const centroids = clusters.map((c) => c.reduce((a, b) => a + b, 0) / (c.length || 1));

    for (const row of blockRows) {
      const cells = {};
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
        const type = columnTypes[best];
        cells[type] = cells[type] ? `${cells[type]} ${item.text}` : item.text;
      }

      if (!cells.date || !DATE_LIKE.test(cells.date)) continue;
      const amountMatch = cells.amount && AMOUNT_WITH_DIRECTION.exec(cells.amount.trim());
      if (!amountMatch) {
        skippedNonTransactionRows.push({ reason: "no Dr/Cr amount", cells });
        continue;
      }

      transactions.push({
        date: cells.date,
        description: cells.description || null,
        category: cells.category || null,
        amount: parseFloat(amountMatch[1].replace(/,/g, "")),
        direction: amountMatch[2].toLowerCase() === "dr" ? "debit" : "credit",
        cashback: cells.cashback || null,
      });
    }
    blockRows = [];
  };

  let ended = false;
  for (const row of rows) {
    const rowText = row.items.map((i) => i.text).join(" ");
    if (/end of statement/i.test(rowText)) {
      // Real transaction data never resumes after this marker (later pages hold only schedules of
      // charges, legal text, etc. - as page 3 of a real statement confirmed, letting those
      // continue to be scanned risks an unrelated mini-table being mistaken for a real header).
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
    if (!columnTypes) continue; // haven't seen a header yet on this page
    blockRows.push(row);
  }
  if (!ended) flushBlock();

  return { transactions, skippedNonTransactionRows, ended };
}

/**
 * Extracts transactions from a card/list layout (e.g. a UPI app's "Spends" export): each entry is
 * a name+amount row (identified by a literal "₹" item, not by position - this format has no
 * header/columns to anchor on), an optional single-letter avatar row to ignore, then a date row
 * that completes it. Unlike the table format, x-positions here are stable for the whole document,
 * so all pages' rows can be scanned as one continuous stream instead of resetting per page.
 * A standalone short row before an entry (e.g. "Spends", "Bank transfers", "Cashback") is recorded
 * as that entry's section, since not every section's date row carries a payment method.
 */
function extractCardListTransactions(rows) {
  const transactions = [];
  let currentSection = null;
  let pending = null;

  for (const row of rows) {
    const texts = row.items.map((i) => i.text);
    const rowText = texts.join(" ").trim();

    const rupeeIndex = texts.indexOf("₹");
    if (rupeeIndex !== -1) {
      const name = texts[0];
      const amount = parseFloat(texts.slice(rupeeIndex + 1).join("").replace(/,/g, ""));
      if (name && !Number.isNaN(amount)) pending = { name, amount };
      continue;
    }

    if (texts.length === 1 && texts[0].trim().length === 1) continue; // avatar initial

    const dateMatch = CARD_LIST_DATE_LINE.exec(rowText);
    if (dateMatch) {
      if (pending) {
        transactions.push({
          section: currentSection,
          name: pending.name,
          amount: pending.amount,
          date: rowText.split(/[••]/)[0].trim(),
          method: dateMatch[2] ? dateMatch[2].trim() : null,
        });
        pending = null;
      }
      continue;
    }

    if (texts.length === 1 && rowText.length > 0 && rowText.length < 40) {
      currentSection = rowText; // a short standalone label - best guess is a new section heading
    }
  }

  return transactions;
}

async function main() {
  const { file, password, page, all, extract } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.log(
      "Usage: node scripts/parse-statement.mjs <path-to-pdf> [password] [--page N] [--all] [--extract]",
    );
    process.exit(1);
  }

  const data = new Uint8Array(readFileSync(file));
  // verbosity: 0 suppresses pdfjs's internal warn/info logging (e.g. missing font-metric fallback
  // data, which Node's fetch() can't load from a file:// URL anyway) - it does not affect thrown
  // errors like a wrong password, which are still caught below.
  const loadingTask = getDocument({ data, verbosity: 0 });
  loadingTask.onPassword = (updatePassword, reason) => {
    // reason 1 = need password, 2 = incorrect password already tried
    if (password) {
      updatePassword(password);
    } else {
      console.error(
        "This PDF is password protected. Re-run with the password as the second argument.",
      );
      process.exit(1);
    }
  };

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    console.error("Failed to open PDF:", err?.message || err);
    process.exit(1);
  }

  console.log(`Opened "${file}" - ${doc.numPages} page(s)\n`);

  const pagesToPrint = page ? [page] : all ? range(1, doc.numPages) : range(1, Math.min(5, doc.numPages));
  if (!page && !all && doc.numPages > 5) {
    console.log(`(showing first 5 of ${doc.numPages} pages; use --page N or --all for more)\n`);
  }

  if (extract) {
    const allRowsInOrder = [];
    const allTransactions = [];
    const allSkipped = [];
    let tableEnded = false;
    for (const pageNum of pagesToPrint) {
      const pdfPage = await doc.getPage(pageNum);
      const textContent = await pdfPage.getTextContent();
      const rows = groupIntoRows(textContent.items);
      allRowsInOrder.push(...rows);
      if (tableEnded) continue; // still need this page's rows for the card-list fallback below
      const { transactions, skippedNonTransactionRows, ended } = extractTransactionsFromPage(rows);
      allTransactions.push(...transactions);
      allSkipped.push(...skippedNonTransactionRows.map((s) => ({ page: pageNum, ...s })));
      if (ended) tableEnded = true; // "End of Statement" seen - no table transactions on later pages
    }

    if (allTransactions.length > 0) {
      console.log(
        "(table-header strategy)\n" +
          JSON.stringify({ transactions: allTransactions, skippedNonTransactionRows: allSkipped }, null, 2),
      );
    } else {
      console.log(
        "(no table header found - falling back to card-list strategy)\n" +
          JSON.stringify(extractCardListTransactions(allRowsInOrder), null, 2),
      );
    }
    return;
  }

  for (const pageNum of pagesToPrint) {
    console.log(`\n===== Page ${pageNum} =====`);
    const pdfPage = await doc.getPage(pageNum);
    const textContent = await pdfPage.getTextContent();
    const rows = groupIntoRows(textContent.items);
    for (const row of rows) printRow(row);
  }
}

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
