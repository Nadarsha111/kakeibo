import * as FileSystem from "expo-file-system";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { getSettingsService } from "../database";
import { getGoogleSyncService } from "./GoogleSyncService";

/**
 * Finds statement PDFs in the user's Gmail and saves them to a local file, so they go through the
 * same importStatement() path as a PDF picked from the phone. Everything runs on the phone: the
 * app asks Gmail for matching emails directly with the signed-in user's token, and nothing is
 * stored except the PDF in the cache directory and each account's search.
 *
 * Gmail access is asked for only when this is first used (addScopes), so people who only sync to
 * Sheets are never shown a Gmail permission prompt.
 */

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Settings key prefix holding each account's Gmail search, e.g. "statement_mail_query.3". */
const QUERY_KEY_PREFIX = "statement_mail_query.";
const MAX_EMAILS = 10;

export interface StatementEmail {
  messageId: string;
  attachmentId: string;
  attachmentName: string;
  subject: string;
  /** Local "YYYY-MM-DD" date the email arrived. */
  date: string;
}

export type FindEmailsOutcome =
  | { status: "no_access" }
  | { status: "success"; emails: StatementEmail[] }
  | { status: "error"; message: string };

export function getSavedMailQuery(accountId: number): string {
  return getSettingsService().getSetting(`${QUERY_KEY_PREFIX}${accountId}`) ?? "";
}

export function saveMailQuery(accountId: number, query: string): void {
  const trimmed = query.trim();
  if (trimmed) getSettingsService().setSetting(`${QUERY_KEY_PREFIX}${accountId}`, trimmed);
  else getSettingsService().deleteSetting(`${QUERY_KEY_PREFIX}${accountId}`);
}

/**
 * Turns what the user typed into a Gmail search for PDF attachments. A bare address or domain
 * ("statements@bank.com", "bank.com") is treated as the sender; anything with an operator in it
 * ("from:x subject:statement") is used as written.
 */
export function buildGmailQuery(input: string): string {
  const trimmed = input.trim();
  const base = trimmed.includes(":") || trimmed.includes(" ") ? trimmed : `from:(${trimmed})`;
  return `${base} has:attachment filename:pdf newer_than:1y`;
}

/** Signs in if needed, then asks for Gmail read access if this account hasn't granted it yet. */
async function ensureGmailAccess(): Promise<boolean> {
  const sync = getGoogleSyncService();
  if (!(await sync.isSignedIn()) && !(await sync.signIn())) return false;

  const user = await GoogleSignin.getCurrentUser();
  if (user?.scopes?.includes(GMAIL_SCOPE)) return true;

  const response = await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
  return response?.type === "success" && !!response.data?.scopes?.includes(GMAIL_SCOPE);
}

/**
 * GET from the Gmail API. On a 401 the cached token is dropped and the request retried once with
 * a fresh one - access tokens expire after an hour, and Google also withdraws access for apps in
 * "Testing" mode after about a week, which a fresh token surfaces as a clear error.
 */
async function gmailGet(path: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { accessToken } = await GoogleSignin.getTokens();
    const response = await fetch(`${GMAIL_API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) return response.json();
    if (response.status === 401 && attempt === 0) {
      await GoogleSignin.clearCachedAccessToken(accessToken);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Gmail access was refused or has expired. Sign out of Google in Settings, sign in again, and allow Gmail access.");
    }
    throw new Error(`Gmail request failed (${response.status}).`);
  }
}

function header(payload: any, name: string): string {
  const found = (payload?.headers ?? []).find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value ?? "";
}

/** Every PDF attachment in a message, however deeply its parts are nested. */
function pdfParts(part: any): Array<{ filename: string; attachmentId: string }> {
  if (!part) return [];
  const own =
    part.body?.attachmentId &&
    (part.mimeType === "application/pdf" || /\.pdf$/i.test(part.filename ?? ""))
      ? [{ filename: part.filename || "statement.pdf", attachmentId: part.body.attachmentId }]
      : [];
  return own.concat(...(part.parts ?? []).map(pdfParts));
}

function localDate(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The most recent emails matching the account's search that carry a PDF, newest first. */
export async function findStatementEmails(query: string): Promise<FindEmailsOutcome> {
  try {
    if (!(await ensureGmailAccess())) return { status: "no_access" };

    const list = await gmailGet(`/messages?maxResults=${MAX_EMAILS}&q=${encodeURIComponent(buildGmailQuery(query))}`);
    const ids: string[] = (list.messages ?? []).map((m: any) => m.id);

    const messages = await Promise.all(ids.map((id) => gmailGet(`/messages/${id}?format=full`)));
    const emails = messages.flatMap((message: any) =>
      pdfParts(message.payload).map((pdf) => ({
        messageId: message.id as string,
        attachmentId: pdf.attachmentId,
        attachmentName: pdf.filename,
        subject: header(message.payload, "Subject") || "(no subject)",
        date: localDate(Number(message.internalDate)),
      })),
    );
    return { status: "success", emails };
  } catch (error) {
    console.error("Error searching Gmail for statements:", error);
    return { status: "error", message: error instanceof Error ? error.message : "Unknown error" };
  }
}

/** Downloads one statement attachment into the cache directory and returns its file URI. */
export async function downloadStatementPdf(email: StatementEmail): Promise<string> {
  const attachment = await gmailGet(`/messages/${email.messageId}/attachments/${email.attachmentId}`);
  // Gmail sends base64url without padding; the file system wants standard base64.
  let base64 = (attachment.data as string).replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";

  const uri = `${FileSystem.cacheDirectory}gmail-statement-${email.messageId}-${email.attachmentId.slice(0, 16)}.pdf`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}
