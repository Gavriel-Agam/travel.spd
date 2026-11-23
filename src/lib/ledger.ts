// Who is owed and who owes, per expense and between two people. Every number
// is home-currency minor units from the stored shares (like settlement.ts).
import type { LedgerExpense } from './settlement';

export type Net = { memberId: string; net: number };

/**
 * One expense's effect on each person: the payer +(total minus their own
 * share), everyone else −(their share). Joint money (no payer) owes nobody;
 * an expense the payer covered only for themself has no debt either.
 * Payer first, then the largest debts.
 */
export function expenseNets(e: Pick<LedgerExpense, 'paid_by_member_id' | 'amount_ils_minor' | 'splits'>): Net[] {
  const payer = e.paid_by_member_id;
  if (!payer) return [];
  const own = e.splits.filter((s) => s.member_id === payer).reduce((a, s) => a + s.share_ils_minor, 0);
  const others = e.splits.filter((s) => s.member_id !== payer && s.share_ils_minor > 0);
  if (!others.length) return [];
  return [{ memberId: payer, net: e.amount_ils_minor - own }, ...others.map((s) => ({ memberId: s.member_id, net: -s.share_ils_minor })).sort((a, b) => a.net - b.net)];
}

export type PairLine<E> = { expense: E; amount: number };

export type PairBreakdown<E> = {
  /** Expenses you paid that they had a share in (they owe you), and your payments back to them. */
  youPaid: PairLine<E>[];
  /** Expenses they paid that you had a share in (you owe them), and their payments back to you. */
  theyPaid: PairLine<E>[];
  /** Positive: they owe you. Negative: you owe them. */
  net: number;
};

/**
 * Everything between you and one other person: what each paid for the other.
 * A settlement payment counts on the side of the one who paid it. Only the
 * two of you are counted, so with more people this can differ from the
 * suggested transfers (which net out the whole group).
 */
export function pairBreakdown<E extends LedgerExpense>(expenses: readonly E[], me: string, other: string): PairBreakdown<E> {
  const youPaid: PairLine<E>[] = [];
  const theyPaid: PairLine<E>[] = [];
  const shareOf = (e: E, id: string) => e.splits.filter((s) => s.member_id === id).reduce((a, s) => a + s.share_ils_minor, 0);
  for (const e of expenses) {
    if (e.paid_by_member_id === me) {
      const amount = shareOf(e, other);
      if (amount > 0) youPaid.push({ expense: e, amount });
    } else if (e.paid_by_member_id === other) {
      const amount = shareOf(e, me);
      if (amount > 0) theyPaid.push({ expense: e, amount });
    }
  }
  const sum = (l: PairLine<E>[]) => l.reduce((a, x) => a + x.amount, 0);
  return { youPaid, theyPaid, net: sum(youPaid) - sum(theyPaid) };
}
