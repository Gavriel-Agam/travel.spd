import { describe, expect, it } from 'vitest';
import { computeBalances, settleUp, type LedgerExpense } from '../settlement';
import { allocate, previewShares } from '../split';

const A = 'a';
const B = 'b';
const exp = (payer: string | null, amount: number, shares: [string, number][], kind: LedgerExpense['kind'] = 'expense'): LedgerExpense => ({
  kind,
  paid_by_member_id: payer,
  amount_ils_minor: amount,
  splits: shares.map(([member_id, share_ils_minor]) => ({ member_id, share_ils_minor })),
});

describe('joint money (no payer)', () => {
  it('counts as each person\'s share but never as a debt', () => {
    const bal = computeBalances([A, B], [exp(null, 10000, [[A, 5000], [B, 5000]])]);
    expect(bal.find((b) => b.memberId === A)).toMatchObject({ paid: 0, share: 5000, net: 0 });
    expect(bal.find((b) => b.memberId === B)).toMatchObject({ paid: 0, share: 5000, net: 0 });
    expect(settleUp(bal)).toEqual([]);
  });

  it('leaves the debt from personal payments unchanged', () => {
    const withJoint = computeBalances([A, B], [exp(A, 2000, [[A, 1000], [B, 1000]]), exp(null, 9000, [[A, 4500], [B, 4500]])]);
    expect(settleUp(withJoint)).toEqual([{ from: B, to: A, amount: 1000 }]);
  });

  it('splits leftover units by member id when nobody paid', () => {
    expect(allocate(10001, { b: 1, a: 1 }, null)).toEqual([
      { memberId: 'a', share: 5001 },
      { memberId: 'b', share: 5000 },
    ]);
  });

  it('cannot be a treat (a treat belongs to whoever paid)', () => {
    expect(() => previewShares({ type: 'treat' }, null, 1000)).toThrow(/treat needs a payer/);
  });
});
