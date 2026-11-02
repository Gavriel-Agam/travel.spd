import { describe, expect, it } from 'vitest';
import { allocate, previewShares, toSplitEntries, validateSplit } from '../split';
import { computeBalances, settleUp } from '../settlement';

const A = 'aaaaaaaa-0000-0000-0000-000000000000';
const B = 'bbbbbbbb-0000-0000-0000-000000000000';
const sum = (xs: { share: number }[]) => xs.reduce((t, x) => t + x.share, 0);

describe('allocate', () => {
  it('splits evenly and gives the leftover unit to the payer', () => {
    expect(allocate(10001, { [A]: 1, [B]: 1 }, B)).toEqual([
      { memberId: B, share: 5001 },
      { memberId: A, share: 5000 },
    ]);
  });
  it('always sums to the total', () => {
    for (const total of [1, 2, 3, 99, 10001, 123457]) {
      expect(sum(allocate(total, { [A]: 1, [B]: 1 }, A))).toBe(total);
      expect(sum(allocate(total, { [A]: 33.33, [B]: 66.67 }, A))).toBe(total);
      expect(sum(allocate(total, { [A]: 1, [B]: 2, c: 4 }, 'c'))).toBe(total);
    }
  });
  it('rejects empty weights', () => {
    expect(() => allocate(100, {}, A)).toThrow();
  });
});

describe('split types (same cases as scripts/test-sql.mjs)', () => {
  it('equal', () => {
    expect(previewShares({ type: 'equal', memberIds: [A, B] }, A, 12500).map((s) => s.share)).toEqual([6250, 6250]);
  });
  it('percent 70/30 of 36.50', () => {
    const s = previewShares({ type: 'percent', percents: { [A]: 70, [B]: 30 } }, A, 3650);
    expect(s).toEqual([
      { memberId: A, share: 2555 },
      { memberId: B, share: 1095 },
    ]);
  });
  it('amount split 333.33 / 666.67 THB of 103.30 ILS', () => {
    expect(sum(previewShares({ type: 'amount', amounts: { [A]: 33333, [B]: 66667 } }, A, 10330))).toBe(10330);
  });
  it('treat goes to the payer, personal to the chosen member', () => {
    expect(previewShares({ type: 'treat' }, A, 5000)).toEqual([{ memberId: A, share: 5000 }]);
    expect(previewShares({ type: 'personal', memberId: B }, A, 5000)).toEqual([{ memberId: B, share: 5000 }]);
    expect(toSplitEntries({ type: 'treat' }, A)).toEqual([{ member_id: A }]);
  });
  it('validates', () => {
    expect(validateSplit({ type: 'percent', percents: { [A]: 70, [B]: 20 } }, 0)).toEqual({ ok: false, error: 'percent_sum' });
    expect(validateSplit({ type: 'percent', percents: { [A]: 33.33, [B]: 66.67 } }, 0)).toEqual({ ok: true });
    expect(validateSplit({ type: 'amount', amounts: { [A]: 1, [B]: 2 } }, 4)).toEqual({ ok: false, error: 'amount_sum' });
    expect(validateSplit({ type: 'equal', memberIds: [] }, 1)).toEqual({ ok: false, error: 'members' });
  });
});

describe('settlement', () => {
  const exp = (payer: string, total: number, shares: [string, number][], kind: 'expense' | 'settlement' = 'expense') => ({
    kind,
    paid_by_member_id: payer,
    amount_ils_minor: total,
    splits: shares.map(([member_id, share_ils_minor]) => ({ member_id, share_ils_minor })),
  });

  it('separates paid, share and net', () => {
    const ledger = [
      exp(A, 12500, [[A, 6250], [B, 6250]]), // dinner, A paid, 50/50
      exp(A, 5000, [[B, 5000]]), // A paid for B's personal item
      exp(B, 3000, [[B, 3000]]), // B treated (own cost)
    ];
    const [a, b] = computeBalances([A, B], ledger);
    expect(a).toEqual({ memberId: A, paid: 17500, share: 6250, net: 11250 });
    expect(b).toEqual({ memberId: B, paid: 3000, share: 14250, net: -11250 });
    expect(settleUp([a, b])).toEqual([{ from: B, to: A, amount: 11250 }]);
  });

  it('a recorded settlement zeroes balances but not spending', () => {
    const ledger = [exp(A, 12500, [[A, 6250], [B, 6250]]), exp(B, 6250, [[A, 6250]], 'settlement')];
    const bal = computeBalances([A, B], ledger);
    expect(bal.map((b) => b.net)).toEqual([0, 0]);
    expect(bal.map((b) => b.paid)).toEqual([12500, 0]);
    expect(settleUp(bal)).toEqual([]);
  });
});
