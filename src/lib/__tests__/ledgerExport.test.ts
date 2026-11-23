import { describe, expect, it } from 'vitest';
import { buildExportTable, exportFileName, safeText, splitCell, toCsv, toTsv } from '../exportExpenses';
import { expenseNets, pairBreakdown } from '../ledger';
import { formatCoords, placeKey, placeName, tileFor, tilesAround, validCoords } from '../location';
import type { Expense } from '@/types/db';

const split = (member_id: string, share_ils_minor: number) => ({ member_id, share_ils_minor });

describe('expenseNets', () => {
  it('A paid 100 split 50/50 with B: A +50, B −50', () => {
    expect(expenseNets({ paid_by_member_id: 'a', amount_ils_minor: 10000, splits: [split('a', 5000), split('b', 5000)] })).toEqual([
      { memberId: 'a', net: 5000 },
      { memberId: 'b', net: -5000 },
    ]);
  });
  it('payer not sharing (treat for others) gets the whole amount back; biggest debts first', () => {
    expect(expenseNets({ paid_by_member_id: 'a', amount_ils_minor: 9000, splits: [split('b', 3000), split('c', 6000)] })).toEqual([
      { memberId: 'a', net: 9000 },
      { memberId: 'c', net: -6000 },
      { memberId: 'b', net: -3000 },
    ]);
  });
  it('joint money or paid only for themself: nobody owes', () => {
    expect(expenseNets({ paid_by_member_id: null, amount_ils_minor: 100, splits: [split('a', 50), split('b', 50)] })).toEqual([]);
    expect(expenseNets({ paid_by_member_id: 'a', amount_ils_minor: 100, splits: [split('a', 100)] })).toEqual([]);
  });
});

describe('pairBreakdown', () => {
  const e = (id: string, kind: 'expense' | 'settlement', payer: string | null, total: number, splits: ReturnType<typeof split>[]) => ({ id, kind, paid_by_member_id: payer, amount_ils_minor: total, splits });
  const list = [
    e('1', 'expense', 'me', 10000, [split('me', 5000), split('b', 5000)]), // b owes me 50
    e('2', 'expense', 'b', 6000, [split('me', 2000), split('b', 2000), split('c', 2000)]), // I owe b 20
    e('3', 'expense', 'c', 9000, [split('me', 3000), split('b', 3000), split('c', 3000)]), // not between me and b
    e('4', 'settlement', 'b', 1000, [split('me', 1000)]), // b paid me back 10
    e('5', 'expense', null, 4000, [split('me', 2000), split('b', 2000)]), // joint: nothing
  ];
  it('lists both sides and nets them: positive means they owe you', () => {
    const p = pairBreakdown(list, 'me', 'b');
    expect(p.youPaid.map((l) => [l.expense.id, l.amount])).toEqual([['1', 5000]]);
    expect(p.theyPaid.map((l) => [l.expense.id, l.amount])).toEqual([
      ['2', 2000],
      ['4', 1000],
    ]);
    expect(p.net).toBe(2000);
    expect(pairBreakdown(list, 'b', 'me').net).toBe(-2000);
  });
});

describe('location helpers', () => {
  it('coordinates checked, keys and labels', () => {
    expect(validCoords(13.75, 100.5)).toBe(true);
    expect(validCoords(0, 0)).toBe(false);
    expect(validCoords(91, 0)).toBe(false);
    expect(validCoords(null, 1)).toBe(false);
    expect(placeKey(13.75631, 100.50181)).toBe('13.76,100.50');
    expect(formatCoords(13.7563, -0.1)).toBe('13.7563° N, 0.1000° W');
  });
  it('short place names from OpenStreetMap addresses', () => {
    expect(placeName({ suburb: 'Silom', city: 'Bangkok' })).toBe('Silom, Bangkok');
    expect(placeName({ town: 'Pai', state: 'Mae Hong Son' })).toBe('Pai');
    expect(placeName(undefined, 'A, B, C')).toBe('A, B');
    expect(placeName({}, '')).toBeNull();
  });
  it('map tiles around a point: the point sits inside its tile, 3 × 3 around it', () => {
    const t = tileFor(51.5007, -0.1246, 16);
    expect(t).toMatchObject({ x: 32745, y: 21794 });
    expect(t.px).toBeGreaterThanOrEqual(0);
    expect(t.px).toBeLessThan(256);
    const tiles = tilesAround(51.5007, -0.1246, 16);
    expect(tiles).toHaveLength(9);
    expect(tiles[4].url).toBe('https://tile.openstreetmap.org/16/32745/21794.png');
  });
});

describe('export', () => {
  const exp = (p: Partial<Expense>): Expense =>
    ({
      id: 'x',
      trip_id: 't',
      kind: 'expense',
      paid_by_member_id: 'a',
      amount_minor: 12500,
      currency: 'THB',
      amount_ils_minor: 1290,
      category_id: 'food',
      description: 'Pad thai',
      occurred_at: '2026-11-20T05:00:00Z',
      payment_method: 'cash',
      split_type: 'equal',
      tax_free: false,
      deleted_at: null,
      expense_splits: [
        { expense_id: 'x', member_id: 'a', weight: '1', share_pct: null, share_original_minor: null, share_ils_minor: 645 },
        { expense_id: 'x', member_id: 'b', weight: '1', share_pct: null, share_original_minor: null, share_ils_minor: 645 },
      ],
      ...p,
    }) as Expense;
  const labels = {
    col: (k: string) => k,
    sum: (k: string) => k,
    yes: 'Yes',
    no: 'No',
    joint: 'Joint',
    split: (s: string) => s,
    category: (id: string | null) => (id === 'food' ? 'Food' : 'Other'),
    member: (id: string | null) => (id === 'a' ? 'Noa' : id === 'b' ? 'Dan' : ''),
    payment: (k: string) => (k === 'cash' ? 'Cash' : k),
    country: (c: string) => (c === 'TH' ? 'Thailand' : c),
    settlementTitle: (to: string) => `Paid back ${to}`,
  };
  const base = { tripName: 'Thailand', startDate: '2026-11-18', endDate: '2026-11-30', countries: ['TH'], timeZone: 'Asia/Bangkok', now: new Date('2026-11-23T10:00:00Z'), labels };

  it('summary block, columns and one row per expense (oldest first; pending review left out)', () => {
    const t = buildExportTable(
      [
        exp({ id: '2', occurred_at: '2026-11-21T05:00:00Z', description: '=HACK()', lat: 13.7563, lng: 100.5018, location_name: null, tax_free: true }),
        exp({ id: '1' }),
        exp({ id: '3', review_status: 'pending_review' }),
        exp({ id: '4', occurred_at: '2026-11-22T05:00:00Z', payment_method: null, kind: 'settlement', paid_by_member_id: 'b', amount_minor: 500, currency: 'ILS', amount_ils_minor: 500, split_type: 'personal', expense_splits: [{ expense_id: '4', member_id: 'a', weight: '1', share_pct: null, share_original_minor: null, share_ils_minor: 500 }] }),
      ],
      base,
    );
    expect(t.summary).toEqual([
      ['app', 'SmartTrip'],
      ['trip', 'Thailand'],
      ['dates', '2026-11-18 - 2026-11-30'],
      ['destinations', 'Thailand'],
      ['total', 25.8],
      ['exported', '2026-11-23'],
    ]);
    expect(t.columns).toHaveLength(11);
    expect(t.rows).toHaveLength(3);
    expect(t.rows[0]).toEqual(['2026-11-20', 'Pad thai', 'Food', 125, 'THB', 12.9, 'Cash', 'Noa', 'equal: Noa, Dan', 'No', '']);
    expect(t.rows[1][9]).toBe('Yes');
    expect(t.rows[1][10]).toBe('13.7563° N, 100.5018° E');
    expect(t.rows[2]).toEqual(['2026-11-22', 'Paid back Noa', '', 5, 'ILS', 5, '', 'Dan', 'settlement: Noa', 'No', '']);
  });

  it('CSV starts with a BOM, quotes commas, and keeps formula-like text as text; TSV for Sheets', () => {
    const t = buildExportTable([exp({ description: '=HACK(), "x"' })], base);
    const csv = toCsv(t);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`"'=HACK(), ""x"""`);
    expect(toTsv(t)).toContain("'=HACK(), \"x\"");
    expect(safeText(-5)).toBe(-5);
    expect(safeText('-5')).toBe("'-5");
  });

  it('split cells and file names', () => {
    expect(splitCell(exp({ split_type: 'percent', expense_splits: [{ expense_id: 'x', member_id: 'a', weight: '1', share_pct: '70', share_original_minor: null, share_ils_minor: 1 }] }), labels as never)).toBe('percent: Noa 70%');
    expect(exportFileName('Thai / Laos: 2026', '2026-11-23', 'xlsx')).toBe('SmartTrip-Thai-Laos-2026-2026-11-23.xlsx');
  });
});
