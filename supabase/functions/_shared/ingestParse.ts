// Reads card / Wallet payments sent by iOS Shortcuts (ingest-smart-item).
// Pure code (Web Crypto only): also run by the app's unit tests.
//
// Israeli card push notifications differ by issuer and change over time, so
// this reads the common shape (amount + currency, merchant, last 4 digits)
// instead of fixed templates. Anything it can't read with confidence is
// "ambiguous" and goes to the AI reader instead.

export type Issuer = 'cal' | 'max' | 'isracard' | 'amex' | 'one_zero';

export type Parsed =
  | { status: 'ok'; amount: string; currency: string | null; merchant: string | null; card_last4: string | null; issuer: Issuer | null }
  | { status: 'ignored'; reason: 'otp' | 'billing' | 'declined' | 'refund' | 'not_payment' }
  | { status: 'ambiguous' };

const SYMBOLS: [RegExp, string][] = [
  [/^(₪|ש["״']?ח|nis|ils|שקל(ים)?)$/i, 'ILS'],
  [/^(us\$|\$|usd|דולר(ים)?)$/i, 'USD'],
  [/^(€|eur|יורו|אירו)$/i, 'EUR'],
  [/^(£|gbp|ליש["״]?ט|פאונד)$/i, 'GBP'],
  [/^(฿|thb|באט|bht)$/i, 'THB'],
  [/^(₫|vnd|דונג)$/i, 'VND'],
  [/^(¥|jpy|ין)$/i, 'JPY'],
  [/^(₩|krw)$/i, 'KRW'],
  [/^(₹|inr)$/i, 'INR'],
  [/^(₺|try)$/i, 'TRY'],
  [/^(₱|php)$/i, 'PHP'],
  [/^(zł|pln)$/i, 'PLN'],
  [/^(kč|czk)$/i, 'CZK'],
  [/^(a\$|aud)$/i, 'AUD'],
  [/^(c\$|cad)$/i, 'CAD'],
  [/^(s\$|sgd)$/i, 'SGD'],
  [/^(hk\$|hkd)$/i, 'HKD'],
];

/**
 * ISO 4217 codes read from text. Only these count as a currency, so a word in
 * capitals next to a number ("MAX 45.90", "CAL 12") is never taken for one.
 */
export const KNOWN_CODES = new Set(
  ('ILS USD EUR GBP THB VND JPY KRW INR TRY PHP PLN CZK AUD CAD SGD HKD CHF CNY NZD SEK NOK DKK HUF RON BGN ISK MXN BRL ARS CLP COP PEN ' +
    'ZAR EGP JOD AED SAR QAR BHD KWD OMR MAD TND GEL AMD AZN KZT UZS RUB UAH RSD BAM MKD ALL MDL IDR MYR TWD LKR NPR KHR LAK MMK ' +
    'MNT KES TZS UGX ETB NGN GHS XOF XAF DOP CRC GTQ PAB UYU BOB PYG CUP JMD TTD BSD BBD FJD MVR MUR SCR').split(' '),
);

/** Currencies written without cents, where "120.000" means a hundred and twenty thousand. */
const NO_CENTS = new Set(['VND', 'JPY', 'KRW', 'IDR', 'CLP', 'ISK', 'UGX', 'PYG', 'KHR', 'LAK', 'MMK', 'UZS', 'XOF', 'XAF']);

/** ISO code for a symbol, word or code ("₪", "ש״ח", "usd"), or null. */
export function currencyOf(token: string | null | undefined): string | null {
  if (!token) return null;
  const t = token.trim();
  for (const [re, code] of SYMBOLS) if (re.test(t)) return code;
  return /^[A-Za-z]{3}$/.test(t) && KNOWN_CODES.has(t.toUpperCase()) ? t.toUpperCase() : null;
}

/** Right-to-left / left-to-right marks iPhone puts around amounts in Hebrew text. */
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]/g;
export const stripBidi = (s: string) => s.replace(BIDI, '');

/** "1,234.56" / "1.234,56" / "45.9" / "1 200" -> "1234.56" (dot decimals), or null. */
export function normalizeAmount(raw: string | number | null | undefined, currency?: string | null): string | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? String(raw) : null;
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s  ]/g, '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  // "120.000 ₫" / "1,500 ¥": thousands marks only
  if (currency && NO_CENTS.has(currency) && /^\d{1,3}([.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, '');
  } else if (lastDot >= 0 && lastComma >= 0) {
    // The later one is the decimal mark
    s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    // "1,200" thousands, "45,90" decimals
    s = /,\d{3}$/.test(s) && !/,\d{3},/.test(s + ',') ? s.replace(/,/g, '') : s.replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\.(?=.*\.)/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? String(Number(n.toFixed(4))) : null;
}

/** An amount with a currency next to it: "₪45.90", "45.90 ש״ח", "USD 12", "12.50$". */
const CUR = String.raw`(US\$|A\$|C\$|S\$|HK\$|₪|\$|€|£|฿|₫|¥|₩|₹|₺|₱|zł|Kč|ש["״']?ח|שקלים|שקל|דולרים|דולר|יורו|אירו|ליש["״]?ט|פאונד|באט|דונג|NIS|ILS|[A-Za-z]{3})`;
const NUM = String.raw`(\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const MONEY_AFTER = new RegExp(`${NUM}\\s?${CUR}`, 'u');
const MONEY_BEFORE = new RegExp(`${CUR}\\s?${NUM}`, 'u');
// A number after "בסך" / "סכום" / "amount" with no currency
const BARE_AMOUNT = /(?:בסך|סך|סכום(?: של)?|על סך|amount(?: of)?|total)\s*:?\s*(\d[\d,.]*)/iu;

/** Every match of a money pattern, so a capital word that is not a currency ("MAX 45") doesn't hide the real one. */
function allMatches(re: RegExp, text: string): RegExpExecArray[] {
  return [...text.matchAll(new RegExp(re.source, re.flags + 'g'))];
}

/** The first amount written with its currency, as charged. */
export function findMoney(input: string): { amount: string; currency: string | null } | null {
  const text = stripBidi(input);
  const candidates: { at: number; amount: string | null; currency: string | null }[] = [];
  for (const a of allMatches(MONEY_AFTER, text)) {
    const cur = currencyOf(a[2]);
    // The currency word has to end there ("12 USDT" is not dollars)
    if (cur && !/^\p{L}/u.test(text.slice(a.index + a[0].length))) candidates.push({ at: a.index, amount: normalizeAmount(a[1], cur), currency: cur });
  }
  for (const b of allMatches(MONEY_BEFORE, text)) {
    const cur = currencyOf(b[1]);
    // ... and start there ("SUSD 12" is not dollars)
    if (cur && !/\p{L}$/u.test(text.slice(0, b.index))) candidates.push({ at: b.index, amount: normalizeAmount(b[2], cur), currency: cur });
  }
  const first = candidates.filter((c) => c.amount).sort((x, y) => x.at - y.at)[0];
  if (first) return { amount: first.amount!, currency: first.currency };
  const bare = BARE_AMOUNT.exec(text);
  const amount = bare ? normalizeAmount(bare[1]) : null;
  return amount ? { amount, currency: null } : null;
}

export function detectIssuer(text: string): Issuer | null {
  if (/\bcal\b|כאל|ויזה כאל|visa cal/i.test(text)) return 'cal';
  if (/\bmax\b|מקס|לאומי קארד/i.test(text)) return 'max';
  if (/isracard|ישראכרט/i.test(text)) return 'isracard';
  if (/amex|american express|אמריקן אקספרס|אמקס/i.test(text)) return 'amex';
  if (/one\s?zero|וואן זירו|ONE ZERO/i.test(text)) return 'one_zero';
  return null;
}

const LAST4 = /(?:המסתיים|מסתיים|שמסתיים|ending(?: in)?|ends in|כרטיס(?:ך|כם)?(?: מספר| שמספרו)?|card|••|\*{2,})\s*(?:ב[-־]?|in\s)?\s*(?:\*+|•+)?\s*(\d{4})(?!\d)/iu;

// Where the merchant starts, and where it ends
const MERCHANT_START = [
  /(?:בבית העסק|בבית עסק|בעסק|אצל)\s*:?\s*/u,
  /(?:^|\s)(?:at|@)\s+/iu,
  /(?:^|\s)ב[-־]\s*(?=[^\d\s])/u,
  /(?:merchant|בית עסק)\s*:\s*/iu,
];
const MERCHANT_END = /\s*(?:[.,;\n|]|\s+(?:בתאריך|בכרטיס|בסך|ב[-־]?\d|on\s+\d|on\s+your|with\s+card|using|ב-?\s?\d{1,2}[./])|$)/iu;

export function findMerchant(text: string): string | null {
  for (const re of MERCHANT_START) {
    const m = re.exec(text);
    if (!m) continue;
    const rest = text.slice(m.index + m[0].length);
    const end = MERCHANT_END.exec(rest);
    const name = (end ? rest.slice(0, end.index) : rest).trim().replace(/^["'״“”]+|["'״“”]+$/g, '');
    // Not a number, not a currency, not too long
    if (name.length >= 2 && name.length <= 60 && !/^\d[\d.,\s]*$/.test(name) && !currencyOf(name)) return name;
  }
  return null;
}

const OTP = /(קוד(?: אימות| חד[- ]פעמי)?|סיסמ[הא] חד[- ]פעמית|one[- ]time|otp|verification|passcode|code)\D{0,20}\d{4,8}/iu;
const BILLING = /(מועד החיוב|חיוב חודשי|החיוב הקרוב|פירוט החיובים|פירוט חיובים|דף פירוט|הודעת חיוב|יחויב(?:ו)? ב[-־]?\s?\d{1,2}[./]|billing date|statement|upcoming charge|direct debit)/iu;
const DECLINED = /(נדחת?ה|לא אושרה|סורבה|declined|was not approved|failed)/iu;
const REFUND = /(זיכוי|החזר כספי|הוחזר|refund|credited|reversal)/iu;
const PAYMENT_WORDS = /(עסקה|חיוב|רכישה|תשלום|שולם|בוצע|אושר|קנייה|purchase|payment|paid|spent|charged|transaction|apple pay)/iu;

/** One card push notification (title + subtitle + body). */
export function parseNotification(p: { raw_text: string; title?: string | null; subtitle?: string | null }): Parsed {
  const text = stripBidi([p.title, p.subtitle, p.raw_text].filter((x) => typeof x === 'string' && x.trim()).join(' \n ')).slice(0, 1000);
  if (OTP.test(text)) return { status: 'ignored', reason: 'otp' };
  if (BILLING.test(text)) return { status: 'ignored', reason: 'billing' };
  if (DECLINED.test(text)) return { status: 'ignored', reason: 'declined' };
  if (REFUND.test(text)) return { status: 'ignored', reason: 'refund' };
  const money = findMoney(text);
  if (!money) return PAYMENT_WORDS.test(text) ? { status: 'ambiguous' } : { status: 'ignored', reason: 'not_payment' };
  const merchant = findMerchant(text);
  const issuer = detectIssuer(text);
  // Israeli issuers write a missing currency as shekels
  const currency = money.currency ?? (issuer ? 'ILS' : null);
  if (!currency || !merchant) return { status: 'ambiguous' };
  return { status: 'ok', amount: money.amount, currency, merchant, card_last4: LAST4.exec(text)?.[1] ?? null, issuer };
}

/** A Wallet automation's fields: the amount often arrives as "₪45.90" or "45,90 €". */
export function parseWallet(p: { amount: unknown; currency?: unknown; merchant?: unknown; raw_text?: unknown }):
  | { amount: string; currency: string | null; merchant: string | null }
  | null {
  const raw = stripBidi(typeof p.amount === 'number' ? String(p.amount) : typeof p.amount === 'string' ? p.amount : '');
  const given = currencyOf(typeof p.currency === 'string' ? stripBidi(p.currency) : null);
  // The amount as charged ("₫120.000", "THB 300.00")
  const inAmount = findMoney(raw);
  // A bare number: the currency from the whole transaction text the Shortcut passed, if any
  const inText = !inAmount && !given && typeof p.raw_text === 'string' ? findMoney(p.raw_text.slice(0, 1000)) : null;
  const currency = given ?? inAmount?.currency ?? inText?.currency ?? null;
  const amount = inAmount?.amount ?? normalizeAmount(raw, currency) ?? inText?.amount ?? null;
  if (!amount) return null;
  // Never guessed: null here means none was sent, and the trip's own currency is used
  const merchant = typeof p.merchant === 'string' && p.merchant.trim() ? p.merchant.trim().slice(0, 120) : null;
  return { amount, currency, merchant };
}

export function normalizeMerchant(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

/** "2026-11-10T08:05:42Z" -> "2026-11-10T08:05" (UTC), so a retry within the minute matches. */
export function minuteOf(iso: string | null | undefined, now = new Date()): string {
  const d = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : now;
  return d.toISOString().slice(0, 16);
}

// RFC 4122 URL namespace; any fixed one works, it only has to stay the same
const NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

/** UUID v5 (SHA-1 of namespace + name). */
export async function uuidv5(name: string, namespace = NAMESPACE): Promise<string> {
  const ns = namespace.replace(/-/g, '').match(/../g)!.map((h) => parseInt(h, 16));
  const bytes = new Uint8Array([...ns, ...new TextEncoder().encode(name)]);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The same payment sent twice (a Shortcut retry, or Wallet and the bank's
 * notification for the same tap... when the card label matches) gets the same id.
 */
export function dedupeClientId(p: { source: string; user: string; card: string | null; amount: string; currency: string | null; merchant: string | null; occurred_at: string | null }, now = new Date()) {
  const name = [p.source, p.user, (p.card ?? '').trim().toLowerCase(), p.amount, p.currency ?? '', normalizeMerchant(p.merchant), minuteOf(p.occurred_at, now)].join('|');
  return uuidv5(name);
}

export async function sha256Hex(s: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}
