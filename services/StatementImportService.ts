// pdfjs's Node build isn't usable here (Metro can't do the runtime-computed dynamic import() its
// fake-worker fallback normally relies on - RN has no on-device dynamic module loader). Its
// documented workaround is this: statically import the worker module yourself and hand its
// exports to pdfjs via globalThis, so the fake-worker setup finds them directly instead.
// @ts-ignore - pdfjs-dist ships no types for this deep subpath, and none are needed here.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// @ts-ignore
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
(globalThis as any).pdfjsWorker = pdfjsWorker;

import * as SecureStore from "expo-secure-store";
import { File } from "expo-file-system/next";
import { extractStatementTransactions, StatementTextItem } from "../utils/statementParsing";
import { getStatementService } from "../database";

const PASSWORD_KEY_PREFIX = "kakeibo.statementPassword.";

export type ImportOutcome =
  | { status: "needs_password" }
  | { status: "wrong_password" }
  | { status: "no_transactions_found" }
  | { status: "success"; strategy: "table" | "card-list"; count: number }
  | { status: "error"; message: string };

async function getSavedPassword(accountId: number): Promise<string | undefined> {
  try {
    return (await SecureStore.getItemAsync(`${PASSWORD_KEY_PREFIX}${accountId}`)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function forgetSavedPassword(accountId: number): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(`${PASSWORD_KEY_PREFIX}${accountId}`);
  } catch {
    // Nothing to forget, or the platform keystore rejected the delete - either way, ignore.
  }
}

/**
 * Opens a PDF, trying `passwordAttempt` if the caller supplied one. Resolves rather than rejects
 * on a password problem, distinguishing "none was ever tried" from "the one tried was wrong" (via
 * pdfjs's PasswordResponses: reason 1 = NEED_PASSWORD, reason 2 = INCORRECT_PASSWORD), so the
 * caller can decide whether to prompt for the first time or say "wrong password, try again".
 */
function openDocument(
  data: Uint8Array,
  passwordAttempt?: string,
): Promise<{ ok: true; doc: any } | { ok: false; reason: "needs_password" | "wrong_password" }> {
  return new Promise((resolve) => {
    const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
    let settled = false;
    loadingTask.onPassword = (updatePassword: (p: string) => void, reason: number) => {
      if (passwordAttempt && reason === 1) {
        updatePassword(passwordAttempt);
        return;
      }
      settled = true;
      resolve({ ok: false, reason: reason === 2 ? "wrong_password" : "needs_password" });
    };
    loadingTask.promise.then(
      (doc: any) => {
        if (!settled) resolve({ ok: true, doc });
      },
      () => {
        if (!settled) resolve({ ok: false, reason: "needs_password" });
      },
    );
  });
}

async function getAllPagesTextItems(doc: any): Promise<StatementTextItem[][]> {
  const pages: StatementTextItem[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items as StatementTextItem[]);
  }
  return pages;
}

/**
 * Imports a statement PDF for one account/month, replacing any previously imported line items for
 * that same account/month. Tries the account's saved password automatically if `password` isn't
 * given; on success with an explicit `password`, saves it for next month. Returns "needs_password"
 * or "wrong_password" instead of throwing, so the caller can prompt and retry rather than treating
 * a password prompt as a failure.
 */
export async function importStatement(
  fileUri: string,
  profileId: number,
  accountId: number,
  statementMonth: string,
  password?: string,
): Promise<ImportOutcome> {
  try {
    const data = new File(fileUri).bytes();
    const attempt = password ?? (await getSavedPassword(accountId));

    const opened = await openDocument(data, attempt);
    if (!opened.ok) return { status: opened.reason };
    if (password) {
      await SecureStore.setItemAsync(`${PASSWORD_KEY_PREFIX}${accountId}`, password);
    }

    const pages = await getAllPagesTextItems(opened.doc);
    const { strategy, transactions } = extractStatementTransactions(pages);

    if (strategy === "none" || transactions.length === 0) {
      return { status: "no_transactions_found" };
    }

    getStatementService().importLineItems(profileId, accountId, statementMonth, transactions);
    return { status: "success", strategy, count: transactions.length };
  } catch (error) {
    console.error("Error importing statement:", error);
    return { status: "error", message: error instanceof Error ? error.message : "Unknown error" };
  }
}
