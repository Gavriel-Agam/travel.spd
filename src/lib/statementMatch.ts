// Card statement matcher: reads a monthly card statement (CSV, or rows copied
// from Excel) on the phone, finds each line's expense, and records what the card
// really billed in shekels. Lines with no expense can be added (pending review).
// Nothing is uploaded: the file is read on the device.
import { HOME_CURRENCY } from './currencies';
import type { Expense } from '@/types/db';

export type StatementRow = {
  /** YYYY-MM-DD */
  date: string;
  merchant: string;
  /** Amount as paid, in `currency` (null when the statement shows only the shekel charge). */
  amount: number | null;
  currency: string | null;
  /** What the card billed, in agorot. */
  billedMinor: number;
};

const HEADERS = {
  date: /^(תאריך(\s*(ה)?עסקה)?|תאריך רכישה|date|transaction date|purchase date)$/i,
  merchant: /^(שם בית (ה)?עסק|בית (ה)?עסק|תיאור|פרטים|merchant|description|business|payee)$/i,
  amount: /^(סכום (ה)?עסקה|סכום מקורי|סכום עסקה מקורי|original amount|transaction amount|amount)$/i,
  currency: /^(מטבע( (ה)?עסקה)?|מטבע מקור|currency|original currency)$/i,
  billed: /^(סכום (ה)?חיוב|סכום לחיוב|חיוב|סכום חיוב ב?₪?|billed|charge amount|billing amount|amount charged)$/i,
};

/** Splits one line, with quoted cells ("a, b"). */
export function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const neg = /^-|-$|^\(.*\)$/.test(s.trim());
  let t = s.replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
};

const CURRENCY_WORDS: [RegExp, string][] = [
  [/^(₪|ש["״]?ח|ils|nis)$/i, 'ILS'],
  [/^(\$|usd|דולר)$/i, 'USD'],
  [/^(€|eur|יורו|אירו)$/i, 'EUR'],
  [/^(£|gbp)$/i, 'GBP'],
  [/^(฿|thb)$/i, 'THB'],
];
const currencyOf = (s: string | undefined): string | null => {
  const t = (s ?? '').trim();
  if (!t) return null;
  for (const [re, c] of CURRENCY_WORDS) if (re.test(t)) return c;
  return /^[A-Za-z]{3}$/.test(t) ? t.toUpperCase() : null;
};

/** "12/11/2026", "12.11.26", "2026-11-12" -> "2026-11-12" (day first, as Israeli statements write it). */
export function parseDate(s: string | undefined): string | null {
  const t = (s ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(t);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const mo = Number(m[2]);
  const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The statement's rows (charges only; refunds and totals are skipped). */
export function parseStatement(text: string): { rows: StatementRow[]; error?: 'no_header' | 'empty' } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], error: 'empty' };
  for (let h = 0; h < Math.min(lines.length, 15); h++) {
    const sep = ['\t', ';', ','].find((s) => lines[h].includes(s)) ?? ',';
    const head = splitLine(lines[h], sep).map((x) => x.replace(/\s+/g, ' ').trim());
    const col = (re: RegExp) => head.findIndex((x) => re.test(x));
    const idx = { date: col(HEADERS.date), merchant: col(HEADERS.merchant), amount: col(HEADERS.amount), currency: col(HEADERS.currency), billed: col(HEADERS.billed) };
    if (idx.date < 0 || idx.merchant < 0 || (idx.billed < 0 && idx.amount < 0)) continue;
    // A single "amount" column with no billed one is the shekel charge
    const billedCol = idx.billed >= 0 ? idx.billed : idx.amount;
    const amountCol = idx.billed >= 0 ? idx.amount : -1;
    const rows: StatementRow[] = [];
    for (const line of lines.slice(h + 1)) {
      const cells = splitLine(line, sep);
      const date = parseDate(cells[idx.date]);
      const billed = num(cells[billedCol]);
      const merchant = (cells[idx.merchant] ?? '').trim();
      if (!date || billed == null || billed <= 0 || !merchant) continue;
      const amount = amountCol >= 0 ? num(cells[amountCol]) : null;
      const currency = idx.currency >= 0 ? currencyOf(cells[idx.currency]) : null;
      rows.push({
        date,
        merchant: merchant.slice(0, 120),
        amount: amount != null && amount > 0 ? amount : null,
        currency: currency ?? (amount != null && amount > 0 ? null : HOME_CURRENCY),
        billedMinor: Math.round(billed * 100),
      });
    }
    return { rows };
  }
  return { rows: [], error: 'no_header' };
}

const days = (a: string, b: string) => Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86_400_000;
const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2));
/** 0..1: how many words of the shorter name the other one has. */
export function nameSimilarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  x.forEach((w) => y.has(w) && common++);
  return common / Math.min(x.size, y.size);
}

export type StatementMatch = { row: StatementRow; expense: Expense };

/**
 * Pairs each statement line with one expense: same amount (in the currency
 * paid, or the shekel charge for shekel expenses) within 3 days; the closest
 * name, then the closest date, wins. Each expense is used once.
 */
export function matchStatement(
  rows: readonly StatementRow[],
  expenses: readonly Expense[],
  digitsOf: (currency: string) => number,
): { matched: StatementMatch[]; unmatched: StatementRow[] } {
  const used = new Set<string>();
  const matched: StatementMatch[] = [];
  const unmatched: StatementRow[] = [];
  const pool = expenses.filter((e) => e.kind === 'expense' && !e.deleted_at && !e.pending);
  for (const row of rows) {
    const fits = pool.filter((e) => {
      if (used.has(e.id) || days(e.occurred_at, row.date) > 3) return false;
      if (row.amount != null && row.currency) {
        return e.currency === row.currency && Math.abs(e.amount_minor - Math.round(row.amount * 10 ** digitsOf(row.currency))) <= 1;
      }
      // Only the shekel charge: a shekel expense of that amount
      return e.currency === HOME_CURRENCY && Math.abs(e.amount_minor - row.billedMinor) <= 1;
    });
    const name = (e: Expense) => `${e.merchant ?? ''} ${e.description}`;
    const best = fits.sort((a, b) => nameSimilarity(row.merchant, name(b)) - nameSimilarity(row.merchant, name(a)) || days(a.occurred_at, row.date) - days(b.occurred_at, row.date))[0];
    if (best) {
      used.add(best.id);
      matched.push({ row, expense: best });
    } else unmatched.push(row);
  }
  return { matched, unmatched };
}

/**
 * The rate that makes the home amount equal what the card billed (fee included,
 * so the fee is set to 0): home per 1 unit of the currency, 10 decimals.
 */
export function billedRate(amountMinor: number, currency: string, billedMinor: number, digitsOf: (c: string) => number): string {
  const major = amountMinor / 10 ** digitsOf(currency);
  return (billedMinor / 100 / major).toFixed(10);
}
