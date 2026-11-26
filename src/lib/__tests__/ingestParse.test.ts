import { describe, expect, it } from 'vitest';
import {
  currencyOf,
  dedupeClientId,
  detectIssuer,
  findMerchant,
  minuteOf,
  normalizeAmount,
  parseNotification,
  parseWallet,
  sha256Hex,
  uuidv5,
} from '../../../supabase/functions/_shared/ingestParse';
import { cleanBooking } from '../../../supabase/functions/_shared/booking';

describe('amounts and currencies', () => {
  it('reads thousands and decimal marks', () => {
    expect(normalizeAmount('1,234.56')).toBe('1234.56');
    expect(normalizeAmount('1.234,56')).toBe('1234.56');
    expect(normalizeAmount('45,90')).toBe('45.9');
    expect(normalizeAmount('1,200')).toBe('1200');
    expect(normalizeAmount('₪ 52.30')).toBe('52.3');
    expect(normalizeAmount('0')).toBeNull();
    expect(normalizeAmount('abc')).toBeNull();
  });
  it('maps symbols and Hebrew words to ISO codes', () => {
    expect(currencyOf('₪')).toBe('ILS');
    expect(currencyOf('ש״ח')).toBe('ILS');
    expect(currencyOf('ש"ח')).toBe('ILS');
    expect(currencyOf('דולר')).toBe('USD');
    expect(currencyOf('€')).toBe('EUR');
    expect(currencyOf('thb')).toBe('THB');
    expect(currencyOf('x')).toBeNull();
  });
});

describe('card notifications', () => {
  it('Cal: amount, merchant and last 4 digits', () => {
    const r = parseNotification({ title: 'Cal', raw_text: 'בכרטיסך המסתיים ב-1234 אושרה עסקה בסך 120.00 USD ב-AMAZON MKTPL.' });
    expect(r).toEqual({ status: 'ok', amount: '120', currency: 'USD', merchant: 'AMAZON MKTPL', card_last4: '1234', issuer: 'cal' });
  });
  it('Max: shekel amount at a Hebrew merchant', () => {
    const r = parseNotification({ title: 'Max', raw_text: 'אושרה עסקה בכרטיס 5678 בסך 52.30 ₪ בבית העסק ארומה תל אביב' });
    expect(r).toMatchObject({ status: 'ok', amount: '52.3', currency: 'ILS', merchant: 'ארומה תל אביב', card_last4: '5678', issuer: 'max' });
  });
  it('Isracard: euro amount', () => {
    const r = parseNotification({ title: 'ישראכרט', raw_text: 'בוצעה עסקה בסך 32.50 EUR בבית עסק CAFE DE FLORE בכרטיסך 4321' });
    expect(r).toMatchObject({ status: 'ok', amount: '32.5', currency: 'EUR', merchant: 'CAFE DE FLORE', issuer: 'isracard' });
  });
  it('Amex / One Zero in English', () => {
    expect(parseNotification({ title: 'American Express', raw_text: 'You spent $18.40 at Uber Trip with card ending 1005' })).toMatchObject({
      status: 'ok', amount: '18.4', currency: 'USD', merchant: 'Uber Trip', card_last4: '1005', issuer: 'amex',
    });
    expect(parseNotification({ title: 'One Zero', raw_text: 'Payment of ₪45.90 at Shufersal Deal' })).toMatchObject({ status: 'ok', currency: 'ILS', merchant: 'Shufersal Deal', issuer: 'one_zero' });
  });
  it('no currency from an Israeli issuer means shekels', () => {
    expect(parseNotification({ title: 'כאל', raw_text: 'עסקה בסך 89.90 בבית העסק סופר פארם' })).toMatchObject({ status: 'ok', amount: '89.9', currency: 'ILS', merchant: 'סופר פארם' });
  });
  it('ignores one-time codes, billing dates, declines and refunds', () => {
    expect(parseNotification({ raw_text: 'קוד האימות שלך הוא 482913' })).toEqual({ status: 'ignored', reason: 'otp' });
    expect(parseNotification({ title: 'Max', raw_text: 'החיוב הקרוב בכרטיסך יחויב ב-10/12 בסך 3,450.20 ₪' })).toEqual({ status: 'ignored', reason: 'billing' });
    expect(parseNotification({ raw_text: 'עסקה בסך 200 ₪ ב-ZARA נדחתה' })).toEqual({ status: 'ignored', reason: 'declined' });
    expect(parseNotification({ raw_text: 'זיכוי בסך 50 ₪ מ-ZARA' })).toEqual({ status: 'ignored', reason: 'refund' });
    expect(parseNotification({ raw_text: 'Your package is on its way' })).toEqual({ status: 'ignored', reason: 'not_payment' });
  });
  it('a payment it cannot read with confidence is ambiguous', () => {
    expect(parseNotification({ raw_text: 'בוצעה רכישה בכרטיסך' }).status).toBe('ambiguous');
    expect(parseNotification({ raw_text: 'Payment of 45 approved' }).status).toBe('ambiguous');
  });
  it('detects issuers and merchants', () => {
    expect(detectIssuer('Visa CAL')).toBe('cal');
    expect(detectIssuer('hello')).toBeNull();
    expect(findMerchant('paid 12 USD at 7-Eleven, Bangkok')).toBe('7-Eleven');
  });
});

describe('Wallet payments', () => {
  it('reads the amount string Shortcuts sends', () => {
    expect(parseWallet({ amount: '₪45.90', merchant: ' Aroma ' })).toEqual({ amount: '45.9', currency: 'ILS', merchant: 'Aroma' });
    expect(parseWallet({ amount: '1.250,00 €' })).toEqual({ amount: '1250', currency: 'EUR', merchant: null });
    expect(parseWallet({ amount: 12, currency: 'thb' })).toEqual({ amount: '12', currency: 'THB', merchant: null });
    expect(parseWallet({ amount: 'free' })).toBeNull();
  });
});

describe('deduplication', () => {
  it('uuid v5 matches the RFC example', async () => {
    // python: uuid.uuid5(uuid.NAMESPACE_DNS, 'python.org')
    expect(await uuidv5('python.org', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });
  it('the same payment within the minute gets the same id; another amount does not', async () => {
    const base = { source: 'shortcut_wallet', user: 'u1', card: 'Max 1234', amount: '45.9', currency: 'ILS', merchant: 'Aroma  TLV', occurred_at: '2026-11-10T08:05:12Z' };
    const a = await dedupeClientId(base);
    expect(await dedupeClientId({ ...base, occurred_at: '2026-11-10T08:05:59Z', merchant: 'aroma tlv' })).toBe(a);
    expect(await dedupeClientId({ ...base, amount: '46' })).not.toBe(a);
    expect(await dedupeClientId({ ...base, occurred_at: '2026-11-10T08:06:00Z' })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('minute and hash helpers', async () => {
    expect(minuteOf('2026-11-10T10:05:42+02:00')).toBe('2026-11-10T08:05');
    expect(minuteOf(null, new Date('2026-01-01T00:00:30Z'))).toBe('2026-01-01T00:00');
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('booking extraction', () => {
  it('keeps valid flight fields and drops invented ones', () => {
    expect(cleanBooking({ kind: 'flight', airline: 'El Al', flight_number: 'ly 081', origin_iata: 'tlv', destination_iata: 'BKK', departure_at: '2026-12-01T23:30:00', pnr: 'ab12cd', passengers: ['Noa', ''], arrival_at: 'tomorrow' })).toEqual({
      kind: 'flight', airline: 'El Al', flight_number: 'LY081', origin_iata: 'TLV', destination_iata: 'BKK', departure_at: '2026-12-01T23:30', pnr: 'AB12CD', passengers: ['Noa'],
    });
  });
  it('hotel fields', () => {
    expect(cleanBooking({ kind: 'hotel', property_name: 'Hotel Muse', city: 'Bangkok', check_in_date: '2026-12-02', check_out_date: '2026-12-05', confirmation_code: '123-456', address: null })).toEqual({
      kind: 'hotel', property_name: 'Hotel Muse', city: 'Bangkok', check_in_date: '2026-12-02', check_out_date: '2026-12-05', confirmation_code: '123-456',
    });
  });
  it('nothing useful, or not a booking: null', () => {
    expect(cleanBooking({ kind: 'flight' })).toBeNull();
    expect(cleanBooking({ kind: 'car', pnr: 'X' })).toBeNull();
    expect(cleanBooking(null)).toBeNull();
  });
});

describe('exact currency as charged (no guessing)', () => {
  it('reads each symbol and code next to the amount', () => {
    const cases: [string, string, string][] = [
      ['120.00 ₪', '120', 'ILS'],
      ['ILS 120', '120', 'ILS'],
      ['$45.00', '45', 'USD'],
      ['45.00 USD', '45', 'USD'],
      ['€12,50', '12.5', 'EUR'],
      ['฿300.00', '300', 'THB'],
      ['THB 1,250.00', '1250', 'THB'],
      ['£9.99', '9.99', 'GBP'],
      ['₫120.000', '120000', 'VND'],
      ['250,000 VND', '250000', 'VND'],
      ['¥1,500', '1500', 'JPY'],
    ];
    for (const [amount, value, code] of cases) expect(parseWallet({ amount }), amount).toEqual({ amount: value, currency: code, merchant: null });
  });
  it('ignores right-to-left marks around a Hebrew amount', () => {
    expect(parseWallet({ amount: '‏45.90‏ ₪' })).toEqual({ amount: '45.9', currency: 'ILS', merchant: null });
    const p = parseNotification({ raw_text: 'עסקה בסך ‎12.50 $‎ בבית העסק Starbucks אושרה' });
    expect(p).toMatchObject({ status: 'ok', amount: '12.5', currency: 'USD' });
  });
  it('a capital word is not a currency: "MAX 45.90 ₪" is shekels', () => {
    expect(currencyOf('MAX')).toBeNull();
    expect(parseNotification({ raw_text: 'MAX 45.90 ₪ בבית העסק שופרסל' })).toMatchObject({ status: 'ok', amount: '45.9', currency: 'ILS' });
  });
  it('a foreign charge from an Israeli issuer keeps its own currency', () => {
    expect(parseNotification({ raw_text: 'כאל: חיוב בסך 300.00 ฿ בבית העסק 7-Eleven בכרטיס המסתיים ב-1234' })).toMatchObject({ amount: '300', currency: 'THB' });
  });
  it('a bare Wallet number takes the currency from the transaction text, else none', () => {
    expect(parseWallet({ amount: '300', raw_text: 'Apple Pay ฿300.00 at 7-Eleven' })).toEqual({ amount: '300', currency: 'THB', merchant: null });
    expect(parseWallet({ amount: '300' })).toEqual({ amount: '300', currency: null, merchant: null });
  });
});
