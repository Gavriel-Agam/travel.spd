// Export a trip's expenses: a short summary block (SmartTrip, trip, dates,
// destinations, total, export date) and one row per expense. The same table
// becomes CSV (UTF-8 with BOM, so Excel shows Hebrew), Excel (.xlsx) or tab
// separated text for pasting into Google Sheets.
import { getCurrency, HOME_CURRENCY } from './currencies';
import { formatCoords, validCoords } from './location';
import type { Expense } from '@/types/db';

export type Cell = string | number;
export type ExportTable = { summary: [string, Cell][]; columns: string[]; rows: Cell[][] };

export const EXPORT_COLUMNS = ['date', 'title', 'category', 'original', 'currency', 'totalHome', 'payment', 'paidBy', 'split', 'vat', 'location'] as const;

type Labels = {
  /** Column and summary labels, already in the app's language. */
  col: (key: (typeof EXPORT_COLUMNS)[number]) => string;
  sum: (key: 'app' | 'trip' | 'dates' | 'destinations' | 'total' | 'exported') => string;
  yes: string;
  no: string;
  joint: string;
  /** "Equal", "Personal", "Treat", "Percent", "Amounts", "Payback". */
  split: (type: string) => string;
  category: (id: string | null) => string;
  member: (id: string | null) => string;
  payment: (key: string) => string;
  country: (code: string) => string;
  settlementTitle: (to: string) => string;
};

/** A day in the trip's time zone as YYYY-MM-DD. */
export function dayIn(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

const major = (minor: number, code: string) => minor / 10 ** getCurrency(code).minor_units;

/** Who shared it, as one cell: "Equal: Noa, Dan", "Percent: Noa 70%, Dan 30%". */
export function splitCell(e: Expense, L: Labels): string {
  if (e.kind === 'settlement') return `${L.split('settlement')}: ${L.member(e.expense_splits[0]?.member_id ?? null)}`;
  const parts = e.expense_splits.map((s) => {
    const name = L.member(s.member_id);
    if (e.split_type === 'percent' && s.share_pct != null) return `${name} ${Number(s.share_pct)}%`;
    if (e.split_type === 'amount' && s.share_original_minor != null) return `${name} ${major(Number(s.share_original_minor), e.currency)}`;
    return name;
  });
  return `${L.split(e.split_type)}: ${parts.join(', ')}`;
}

/** The table for a trip's expenses (oldest first). Unconfirmed and deleted ones are left out. */
export function buildExportTable(
  expenses: readonly Expense[],
  p: { tripName: string; startDate: string | null; endDate: string | null; countries: readonly string[]; timeZone: string; now: Date; labels: Labels },
): ExportTable {
  const L = p.labels;
  const list = expenses
    .filter((e) => !e.deleted_at && e.review_status !== 'pending_review' && e.pending_op !== 'delete')
    .slice()
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const total = list.filter((e) => e.kind === 'expense').reduce((a, e) => a + e.amount_ils_minor, 0);
  const dates = p.startDate ? `${p.startDate}${p.endDate ? ` - ${p.endDate}` : ''}` : '';
  const summary: [string, Cell][] = [
    [L.sum('app'), 'SmartTrip'],
    [L.sum('trip'), p.tripName],
    [L.sum('dates'), dates],
    [L.sum('destinations'), p.countries.map(L.country).join(', ')],
    [L.sum('total'), major(total, HOME_CURRENCY)],
    [L.sum('exported'), dayIn(p.now.toISOString(), p.timeZone)],
  ];
  const rows = list.map((e): Cell[] => [
    dayIn(e.occurred_at, p.timeZone),
    e.kind === 'settlement' ? L.settlementTitle(L.member(e.expense_splits[0]?.member_id ?? null)) : e.description || L.category(e.category_id),
    e.kind === 'settlement' ? '' : L.category(e.category_id),
    major(e.amount_minor, e.currency),
    e.currency,
    major(e.amount_ils_minor, HOME_CURRENCY),
    e.payment_method ? L.payment(e.payment_method) : '',
    e.paid_by_member_id ? L.member(e.paid_by_member_id) : L.joint,
    splitCell(e, L),
    e.tax_free ? L.yes : L.no,
    e.location_name || (validCoords(e.lat, e.lng) ? formatCoords(e.lat!, e.lng!) : ''),
  ]);
  return { summary, columns: EXPORT_COLUMNS.map(L.col), rows };
}

/** Every line of the export: summary, a blank line, the column names, the rows. */
export function tableLines(t: ExportTable): Cell[][] {
  return [...t.summary.map(([k, v]) => [k, v]), [], t.columns, ...t.rows];
}

/** Text that a spreadsheet would run as a formula (=, +, -, @) is kept as text. Numbers stay numbers. */
export const safeText = (v: Cell): Cell => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

const csvCell = (v: Cell) => {
  const s = String(safeText(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a UTF-8 BOM (Excel then reads Hebrew correctly). */
export function toCsv(t: ExportTable): string {
  return '﻿' + tableLines(t).map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Tab separated, for pasting into Google Sheets (tabs and line breaks inside cells become spaces). */
export function toTsv(t: ExportTable): string {
  return tableLines(t).map((r) => r.map((v) => String(safeText(v)).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}

/** A safe file name: "SmartTrip-Thailand-2026-11-23.xlsx". */
export function exportFileName(tripName: string, day: string, ext: 'csv' | 'xlsx') {
  const safe = tripName.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 40) || 'trip';
  return `SmartTrip-${safe}-${day}.${ext}`;
}
