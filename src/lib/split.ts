// Mirrors public.save_expense / public.allocate_minor so the form can preview
// exactly what the server will store. The server remains the source of truth.
import Decimal from 'decimal.js';

export type SplitType = 'equal' | 'treat' | 'personal' | 'percent' | 'amount';

/** Entry sent to the save_expense RPC. `value` is a percent or original minor units. */
export type SplitEntry = { member_id: string; value?: number };

export type SplitConfig =
  | { type: 'equal'; memberIds: string[] }
  | { type: 'treat' }
  | { type: 'personal'; memberId: string }
  | { type: 'percent'; percents: Record<string, number> }
  | { type: 'amount'; amounts: Record<string, number> };

export type Share = { memberId: string; share: number };

/** Payer first, then member id: the order leftover units are handed out in. */
function allocationOrder(ids: string[], payerId: string) {
  return [...ids].sort((a, b) => {
    if (a === payerId) return -1;
    if (b === payerId) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Integer shares proportional to weights, summing exactly to `total`. */
export function allocate(total: number, weights: Record<string, Decimal.Value>, payerId: string): Share[] {
  const ids = allocationOrder(Object.keys(weights), payerId);
  const sum = ids.reduce((t, id) => t.plus(weights[id]), new Decimal(0));
  if (ids.length === 0 || sum.lte(0)) throw new Error('invalid_split: weights must be positive');
  const floors = ids.map((id) => new Decimal(total).mul(weights[id]).div(sum).floor().toNumber());
  let rest = total - floors.reduce((t, v) => t + v, 0);
  return ids.map((id, i) => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return { memberId: id, share: floors[i] + extra };
  });
}

export type SplitValidation = { ok: true } | { ok: false; error: 'members' | 'percent_sum' | 'amount_sum' | 'non_positive' };

export function validateSplit(config: SplitConfig, amountMinor: number): SplitValidation {
  switch (config.type) {
    case 'equal':
      return config.memberIds.length > 0 ? { ok: true } : { ok: false, error: 'members' };
    case 'treat':
    case 'personal':
      return { ok: true };
    case 'percent': {
      const vals = Object.values(config.percents);
      if (vals.some((v) => !(v > 0))) return { ok: false, error: 'non_positive' };
      const sum = vals.reduce((t, v) => t.plus(v), new Decimal(0));
      return sum.eq(100) ? { ok: true } : { ok: false, error: 'percent_sum' };
    }
    case 'amount': {
      const vals = Object.values(config.amounts);
      if (vals.some((v) => !(v > 0) || !Number.isInteger(v))) return { ok: false, error: 'non_positive' };
      return vals.reduce((t, v) => t + v, 0) === amountMinor ? { ok: true } : { ok: false, error: 'amount_sum' };
    }
  }
}

/** Payload entries for the RPC. */
export function toSplitEntries(config: SplitConfig, payerId: string): SplitEntry[] {
  switch (config.type) {
    case 'equal':
      return config.memberIds.map((member_id) => ({ member_id }));
    case 'treat':
      return [{ member_id: payerId }];
    case 'personal':
      return [{ member_id: config.memberId }];
    case 'percent':
      return Object.entries(config.percents).map(([member_id, value]) => ({ member_id, value }));
    case 'amount':
      return Object.entries(config.amounts).map(([member_id, value]) => ({ member_id, value }));
  }
}

/** Home-currency shares the server will compute for this configuration. */
export function previewShares(config: SplitConfig, payerId: string, homeTotalMinor: number): Share[] {
  const weights: Record<string, Decimal.Value> = {};
  switch (config.type) {
    case 'equal':
      config.memberIds.forEach((id) => (weights[id] = 1));
      break;
    case 'treat':
      weights[payerId] = 1;
      break;
    case 'personal':
      weights[config.memberId] = 1;
      break;
    case 'percent':
      Object.assign(weights, config.percents);
      break;
    case 'amount':
      Object.assign(weights, config.amounts);
      break;
  }
  return allocate(homeTotalMinor, weights, payerId);
}
