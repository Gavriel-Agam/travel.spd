import { describe, expect, it } from 'vitest';
import { billedRate, matchStatement, nameSimilarity, parseDate, parseStatement, splitLine } from '../statementMatch';
import { confirmInput, merchantPattern, nearDuplicateOf, pendingForMe } from '../pendingReview';
import type { Expense } from '@/types/db';

const digits = (c: string) => (c === 'JPY' || c === 'VND' ? 0 : 2);

const exp = (o: Partial<Expense>): Expense =>
  ({
    id: 'x', trip_id: 't', kind: 'expense', created_by: 'u1', updated_by: 'u1', paid_by_member_id: 'm1', amount_minor: 1000, currency: 'ILS',
    fx_rate: '1', fx_source: 'par', fx_rate_date: null, fx_fetched_at: null, fx_is_manual: false, amount_ils_minor: 1000, category_id: 'c',
    description: '', notes: null, occurred_at: '2026-11-10T10:00:00Z', receipt_path: null, payment_method: 'card', split_type: 'equal',
    version: 1, created_at: '', updated_at: '', deleted_at: null, expense_splits: [{ expense_id: 'x', member_id: 'm1', weight: '1', share_pct: null, share_original_minor: null, share_ils_minor: 1000 }],
    ...o,
  }) as Expense;

describe('statement parsing', () => {
  it('splits quoted cells and reads Israeli dates', () => {
    expect(splitLine('a,"b, c",d', ',')).toEqual(['a', 'b, c', 'd']);
    expect(parseDate('12/11/2026')).toBe('2026-11-12');
    expect(parseDate('3.1.26')).toBe('2026-01-03');
    expect(parseDate('2026-11-12')).toBe('2026-11-12');
    expect(parseDate('13/13/2026')).toBeNull();
  });
  it('a Hebrew CSV with foreign amounts, skipping refunds and totals', () => {
    const csv = [
      'פירוט עסקאות לכרטיס 1234',
      'תאריך עסקה,שם בית העסק,סכום עסקה,מטבע,סכום חיוב',
      '10/11/2026,7-ELEVEN SILOM,"1,250.00",THB,"131.40"',
      '11/11/2026,ארומה,45.90,₪,45.90',
      '12/11/2026,ZARA,-200,₪,-200',
      ',סה"כ,,,177.30',
    ].join('\n');
    expect(parseStatement(csv).rows).toEqual([
      { date: '2026-11-10', merchant: '7-ELEVEN SILOM', amount: 1250, currency: 'THB', billedMinor: 13140 },
      { date: '2026-11-11', merchant: 'ארומה', amount: 45.9, currency: 'ILS', billedMinor: 4590 },
    ]);
  });
  it('rows copied from Excel (tabs), English headers, shekel charge only', () => {
    const tsv = 'Date\tDescription\tAmount\n10/11/2026\tSUPER PHARM\t89.90\n';
    expect(parseStatement(tsv).rows).toEqual([{ date: '2026-11-10', merchant: 'SUPER PHARM', amount: null, currency: 'ILS', billedMinor: 8990 }]);
  });
  it('no recognisable header', () => {
    expect(parseStatement('a,b,c\n1,2,3').error).toBe('no_header');
    expect(parseStatement('').error).toBe('empty');
  });
});

describe('statement matching', () => {
  const thb = exp({ id: 'thb', currency: 'THB', amount_minor: 125000, description: 'Snacks', merchant: '7-Eleven Silom', occurred_at: '2026-11-10T08:00:00Z' });
  const thbOther = exp({ id: 'thb2', currency: 'THB', amount_minor: 125000, description: 'Massage', occurred_at: '2026-11-11T08:00:00Z' });
  const ils = exp({ id: 'ils', amount_minor: 4590, description: 'Aroma', occurred_at: '2026-11-12T08:00:00Z' });
  it('matches by amount and date, prefers the closer name, uses each expense once', () => {
    const rows = [
      { date: '2026-11-10', merchant: '7-ELEVEN SILOM', amount: 1250, currency: 'THB', billedMinor: 13140 },
      { date: '2026-11-11', merchant: 'LET US MASSAGE', amount: 1250, currency: 'THB', billedMinor: 13150 },
      { date: '2026-11-11', merchant: 'ארומה', amount: null, currency: 'ILS', billedMinor: 4590 },
      { date: '2026-11-25', merchant: 'Far away', amount: 10, currency: 'USD', billedMinor: 3700 },
    ];
    const r = matchStatement(rows, [thbOther, thb, ils], digits);
    expect(r.matched.map((m) => m.expense.id)).toEqual(['thb', 'thb2', 'ils']);
    expect(r.unmatched.map((u) => u.merchant)).toEqual(['Far away']);
  });
  it('more than 3 days apart, deleted or queued expenses: no match', () => {
    const rows = [{ date: '2026-11-20', merchant: 'x', amount: null, currency: 'ILS', billedMinor: 4590 }];
    expect(matchStatement(rows, [ils], digits).matched).toHaveLength(0);
    const near = [{ ...rows[0], date: '2026-11-12' }];
    expect(matchStatement(near, [{ ...ils, deleted_at: 'now' }], digits).matched).toHaveLength(0);
    expect(matchStatement(near, [{ ...ils, pending: 'waiting' }], digits).matched).toHaveLength(0);
  });
  it('the billed rate reproduces the charge', () => {
    const rate = billedRate(125000, 'THB', 13140, digits);
    expect(rate).toBe('0.1051200000');
    expect(Math.round(1250 * Number(rate) * 100)).toBe(13140);
    expect(billedRate(3000, 'JPY', 7410, digits)).toBe('0.0247000000');
  });
  it('name similarity', () => {
    expect(nameSimilarity('7-ELEVEN SILOM', '7-Eleven Silom Snacks')).toBe(1);
    expect(nameSimilarity('Zara', 'Aroma')).toBe(0);
  });
});

describe('pending review', () => {
  const a = exp({ id: 'a', review_status: 'pending_review', occurred_at: '2026-11-10T10:00:00Z', merchant: 'Aroma  TLV' });
  const b = exp({ id: 'b', review_status: 'pending_review', created_by: 'u2' });
  const c = exp({ id: 'c', occurred_at: '2026-11-10T10:07:00Z' });
  it('only my own pending items', () => {
    expect(pendingForMe([a, b, c], 'u1').map((e) => e.id)).toEqual(['a']);
    expect(pendingForMe([a], null)).toEqual([]);
  });
  it('confirm shared or personal', () => {
    const members = [{ id: 'm1' }, { id: 'm2' }];
    expect(confirmInput(a, 'shared', members, 'm1')).toMatchObject({ split_type: 'equal', splits: [{ member_id: 'm1' }, { member_id: 'm2' }], review_status: 'confirmed' });
    expect(confirmInput(a, 'personal', members, 'm1')).toMatchObject({ split_type: 'personal', splits: [{ member_id: 'm1' }], review_status: 'confirmed' });
  });
  it('merchant pattern and near duplicates', () => {
    expect(merchantPattern('  Aroma   TLV ')).toBe('aroma tlv');
    expect(merchantPattern('a')).toBeNull();
    expect(nearDuplicateOf(a, [a, c])?.id).toBe('c');
    expect(nearDuplicateOf(a, [a, { ...c, occurred_at: '2026-11-10T10:11:00Z' }])).toBeNull();
  });
});
