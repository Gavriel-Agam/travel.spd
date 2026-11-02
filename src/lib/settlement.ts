// Who paid what, who owes whom. Every number is home-currency minor units taken
// from the stored (historical) ILS values, never recomputed with today's rate.

export type LedgerExpense = {
  kind: 'expense' | 'settlement';
  paid_by_member_id: string;
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
    const payer = get(e.paid_by_member_id);
    payer.net += e.amount_ils_minor;
    if (e.kind === 'expense') payer.paid += e.amount_ils_minor;
    for (const s of e.splits) {
      const m = get(s.member_id);
      m.net -= s.share_ils_minor;
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
