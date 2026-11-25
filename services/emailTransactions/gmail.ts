import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getGoogleSyncService } from '../GoogleSyncService';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

interface MessagePart {
  mimeType: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; attachmentId?: string };
  parts?: MessagePart[];
}

interface MessagePage {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
}

export interface EmailBody {
  mimeType: 'text/plain' | 'text/html';
  text: string;
}

export function decodeGmailBody(data: string): string {
  // Gmail sends base64url. Decode UTF-8 without relying on browser globals in React Native.
  let escaped = '';
  let bits = 0;
  let count = 0;
  for (const character of data.replace(/=+$/, '')) {
    const value = BASE64URL.indexOf(character);
    if (value < 0) throw new Error('Invalid email body encoding.');
    bits = (bits << 6) | value;
    count += 6;
    if (count >= 8) {
      count -= 8;
      escaped += '%' + ((bits >> count) & 255).toString(16).padStart(2, '0');
    }
  }
  return decodeURIComponent(escaped);
}

async function getGmailUser() {
  const sync = getGoogleSyncService();
  if (!(await sync.isSignedIn()) && !(await sync.signIn())) return null;
  const user = GoogleSignin.getCurrentUser();
  if (user?.scopes.includes(GMAIL_SCOPE)) return user;
  const response = await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
  return response?.type === 'success' && response.data.scopes.includes(GMAIL_SCOPE)
    ? response.data
    : null;
}

class GmailRequestError extends Error {
  constructor(readonly status: number) {
    super(status === 401 || status === 403
      ? 'Gmail access was refused. Check that the Gmail API is enabled and that this Google account can grant Gmail access.'
      : `Gmail request failed (${status}). Try again.`);
  }
}

function bodyParts(part: MessagePart): MessagePart[] {
  if (part.filename || part.mimeType === 'message/rfc822') return [];
  if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') return [part];
  return (part.parts ?? []).flatMap(bodyParts);
}

export async function readGmailPage<T>(
  sender: string,
  parse: (bodies: EmailBody[]) => T | null,
  page?: { mailboxId: string; token: string },
): Promise<{ mailboxId: string; items: Array<{ messageId: string; value: T }>; nextPageToken?: string }> {
  const user = await getGmailUser();
  if (!user) throw new Error('Sign in to Google and allow Gmail read access to find transaction alerts.');
  const mailboxId = user.user.id;
  if (page && page.mailboxId !== mailboxId) {
    throw new Error('The signed-in Gmail account changed. Close this screen and search again.');
  }

  let { accessToken } = await GoogleSignin.getTokens();
  const get = async <ResponseBody>(path: string): Promise<ResponseBody> => {
    const response = await fetch(GMAIL_API + path, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new GmailRequestError(response.status);
    return response.json();
  };

  const readPage = async () => {
    const query = encodeURIComponent(`from:${sender} newer_than:30d`);
    const token = page ? `&pageToken=${encodeURIComponent(page.token)}` : '';
    const list = await get<MessagePage>(`/messages?maxResults=25&q=${query}${token}`);
    const messages = list.messages ?? [];
    const items: Array<{ messageId: string; value: T }> = [];

    for (let start = 0; start < messages.length; start += 5) {
      const batch = await Promise.all(messages.slice(start, start + 5).map(async ({ id }) => {
        const path = `/messages/${encodeURIComponent(id)}`;
        const message = await get<{ payload?: MessagePart }>(`${path}?format=full`);
        if (!message.payload) return null;
        const from = message.payload.headers?.find((header) => header.name.toLowerCase() === 'from')?.value.trim();
        const address = from?.match(/<([^<>]+)>$/)?.[1] ?? from;
        if (address?.toLowerCase() !== sender) return null;

        const bodies: EmailBody[] = [];
        for (const part of bodyParts(message.payload)) {
          const attachmentId = part.body?.attachmentId;
          const data = part.body?.data ?? (attachmentId
            ? (await get<{ data?: string }>(`${path}/attachments/${encodeURIComponent(attachmentId)}`)).data
            : undefined);
          if (!data || (part.mimeType !== 'text/plain' && part.mimeType !== 'text/html')) continue;
          try {
            bodies.push({ mimeType: part.mimeType, text: decodeGmailBody(data) });
          } catch {
            // Another MIME alternative, if present, may still be usable.
          }
        }
        const value = parse(bodies);
        return value === null ? null : { messageId: id, value };
      }));
      for (const item of batch) {
        if (item) items.push(item);
      }
    }
    return { mailboxId, items, nextPageToken: list.nextPageToken };
  };

  try {
    return await readPage();
  } catch (error) {
    if (!(error instanceof GmailRequestError) || error.status !== 401) throw error;
    await GoogleSignin.clearCachedAccessToken(accessToken);
    ({ accessToken } = await GoogleSignin.getTokens());
    return readPage();
  }
}
