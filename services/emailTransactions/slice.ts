export const SLICE_SENDER = 'noreply@slice.bank.in';

export interface SliceExpense {
  amount: number;
  date: string;
  payee: string;
  lastFour: string;
  accountKind: 'credit_card' | 'bank';
  reference?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  ensp: ' ', emsp: ' ', thinsp: ' ', ndash: '–', mdash: '—', rsquo: '’',
};

function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(?:br|p|div|table|tr|td|th|li|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (!code.startsWith('#')) return Object.prototype.hasOwnProperty.call(ENTITIES, code) ? ENTITIES[code] : entity;
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    });
}

/** Parses Slice's UPI card-spend and account-debit alerts. */
export function parseSliceExpense(body: string, mimeType: 'text/plain' | 'text/html'): SliceExpense | null {
  const text = (mimeType === 'text/html' ? htmlToText(body) : body)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n');

  const alert = /(?:₹|INR\s+)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)\s+(spent on your slice credit card|debited from your slice account)\s+(?:[x*•]+\s*)?(\d{4})\s+via\s+UPI\b/i.exec(text);
  const dateMatch = /\bTransaction date\s*:?\s*(\d{1,2})-([a-z]{3})-(\d{4}|\d{2})\b/i.exec(text);
  if (!alert || !dateMatch) return null;

  const details = text.slice(dateMatch.index + dateMatch[0].length);
  const payee = /^\s*To\b\s*:?\s*([^\n]+?)(?=\s+RRN\b|\n|$)/i.exec(details)?.[1].trim();
  if (!payee) return null;

  const amount = Number(alert[1].replace(/,/g, ''));
  const year = Number(dateMatch[3]) + (dateMatch[3].length === 2 ? 2000 : 0);
  const month = MONTHS.indexOf(dateMatch[2].toLowerCase()) + 1;
  const day = Number(dateMatch[1]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isSafeInteger(Math.round(amount * 100)) || amount <= 0 ||
      calendarDate.getUTCMonth() + 1 !== month || calendarDate.getUTCDate() !== day) {
    return null;
  }

  return {
    amount,
    date: calendarDate.toISOString().slice(0, 10),
    payee,
    lastFour: alert[3],
    accountKind: alert[2].toLowerCase().startsWith('spent') ? 'credit_card' : 'bank',
    reference: /\bRRN\s*:?\s*(\d{12})\b/i.exec(details)?.[1],
  };
}
