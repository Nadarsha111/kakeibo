export interface ExpenseAlert {
  provider: 'slice' | 'sbi';
  amount: number;
  date: string;
  payee: string;
  lastFour?: string;
  accountKind: 'credit_card' | 'bank';
  reference?: string;
  emi?: {
    principal: number;
    interestRate: number;
    termMonths: number;
    installmentAmount: number;
    firstDueDate: string;
    processingFee?: number;
  };
}

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

export function emailBodyText(body: string, mimeType: 'text/plain' | 'text/html'): string {
  return (mimeType === 'text/html' ? htmlToText(body) : body)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n');
}

export function parseAlertAmount(value: string): number | null {
  const amount = Number(value.replace(/,/g, ''));
  return amount > 0 && Number.isSafeInteger(Math.round(amount * 100)) ? amount : null;
}

export function parseAlertDate(dayText: string, month: number, yearText: string): string | null {
  const day = Number(dayText);
  const year = Number(yearText) + (yearText.length === 2 ? 2000 : 0);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}
