// Who paid what, who owes whom. Every number is home-currency minor units taken
// from the stored (historical) ILS values, never recomputed with today's rate.

export type LedgerExpense = {
  kind: 'expense' | 'settlement';
  /** null: paid from joint money (counts as consumption, never as a debt). */
  paid_by_member_id: string | null;
  amount_ils_minor: number;
  splits: { member_id: string; share_ils_minor: number }[];
};

export type MemberBalance = {
  memberId: string;
  /** Spending this member paid for (settlement transfers excluded). */
  paid: number;
  /** This member's share of the trip's spending. */
  share: number;
  /** Positive: others owe this member. Includes settlement transfers. */
  net: number;
};

export type Transfer = { from: string; to: string; amount: number };

export function computeBalances(memberIds: string[], expenses: LedgerExpense[]): MemberBalance[] {
  const map = new Map(memberIds.map((id) => [id, { memberId: id, paid: 0, share: 0, net: 0 }]));
  const get = (id: string) => {
    if (!map.has(id)) map.set(id, { memberId: id, paid: 0, share: 0, net: 0 });
    return map.get(id)!;
  };
  for (const e of expenses) {
    // Joint money: everyone consumed their share, nobody advanced it, nobody owes it
    const joint = e.paid_by_member_id === null;
    if (!joint) {
      const payer = get(e.paid_by_member_id!);
      payer.net += e.amount_ils_minor;
      if (e.kind === 'expense') payer.paid += e.amount_ils_minor;
    }
    for (const s of e.splits) {
      const m = get(s.member_id);
      if (!joint) m.net -= s.share_ils_minor;
      if (e.kind === 'expense') m.share += s.share_ils_minor;
    }
  }
  return [...map.values()];
}

/** Fewest transfers that zero every balance (greedy largest debtor -> largest creditor). */
export function settleUp(balances: MemberBalance[]): Transfer[] {
  const debtors = balances.filter((b) => b.net < 0).map((b) => ({ id: b.memberId, amt: -b.net }));
  const creditors = balances.filter((b) => b.net > 0).map((b) => ({ id: b.memberId, amt: b.net }));
  debtors.sort((a, b) => b.amt - a.amt || (a.id < b.id ? -1 : 1));
  creditors.sort((a, b) => b.amt - a.amt || (a.id < b.id ? -1 : 1));
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amt, creditors[j].amt);
    if (amount > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].amt -= amount;
    creditors[j].amt -= amount;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return out;
}

/**
 * A member's personal spending: only expenses marked Personal for them (whoever
 * paid). Shared expenses (equal, treat, percent, amount) are left out: they
 * belong to the shared trip budget.
 */
export function personalTotal(
  expenses: readonly { kind: string; split_type?: string; deleted_at?: string | null; amount_ils_minor: number; splits: { member_id: string }[] }[],
  memberId: string,
): number {
  let total = 0;
  for (const e of expenses) {
    if (e.kind !== 'expense' || e.split_type !== 'personal' || e.deleted_at) continue;
    if (e.splits.length === 1 && e.splits[0].member_id === memberId) total += e.amount_ils_minor;
  }
  return total;
}

/** A personal expense the owner paid for themself: only the owner can see it (server rule, migration 0020). */
export function isPrivateExpense(e: { kind: string; split_type?: string; paid_by_member_id: string | null; splits: { member_id: string }[] }): boolean {
  return e.kind === 'expense' && e.split_type === 'personal' && e.paid_by_member_id != null && e.splits.every((s) => s.member_id === e.paid_by_member_id);
}

/**
 * Your part of each expense: its amount becomes the share split to you (your
 * personal expenses in full, your share of shared ones). Expenses with no share
 * of yours are left out; settlements are not spending and are dropped too.
 */
export function myShareExpenses<T extends { kind: string; amount_ils_minor: number; splits: { member_id: string; share_ils_minor: number }[] }>(
  expenses: readonly T[],
  memberId: string,
): T[] {
  const out: T[] = [];
  for (const e of expenses) {
    if (e.kind !== 'expense') continue;
    const mine = e.splits.reduce((t, s) => (s.member_id === memberId ? t + s.share_ils_minor : t), 0);
    if (mine > 0) out.push({ ...e, amount_ils_minor: mine });
  }
  return out;
}
