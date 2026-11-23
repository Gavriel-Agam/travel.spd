// Voice expenses (docs/VOICE_EXPENSE_SPEC.md): what the voice-parse Edge
// Function heard, completed on the phone by fixed rules (the "resolver"), then
// saved through the offline queue like any other new expense.
//
// The model already applies the fallback order and says where each value came
// from; these rules check every id it returned and re-apply every default, so
// the money, the people and the defaults never depend on the model alone.
import Decimal from 'decimal.js';
import type { SaveExpenseInput } from '@/api/queries';
import { getCurrency, HOME_CURRENCY } from './currencies';
import { dateToOccurredAt, rateFor } from './smartImport';
import { toSplitEntries, type SplitConfig } from './split';
import { cardFeeFor, memberFeePct } from './taxFree';
import type { Member, RatesSnapshot, Trip } from '@/types/db';

/** Longest recording sent (seconds); also the hard stop while recording. */
export const VOICE_MAX_SECONDS = 30;
/** Shorter than this is treated as nothing said. */
export const VOICE_MIN_MS = 700;
export const VOICE_TEXT_MAX = 300;

export type Source = 'spoken' | 'inferred' | 'default' | 'unresolved' | 'edited';
export type FieldSources = { amount: Source; currency: Source; paid_by: Source; split: Source; category: Source; date: Source };

/** One item as voice-parse returns it (labels already mapped back to ids). */
export type VoiceParsedItem = {
  kind: 'expense' | 'settlement';
  amount: number | null;
  amount_said: string | null;
  amount_source: 'spoken' | 'missing';
  amount_confidence: 'high' | 'low';
  currency: string | null;
  currency_source: 'spoken' | 'default';
  /** A member id, 'joint', or null. */
  payer: string | null;
  payer_source: 'spoken' | 'default' | 'unresolved';
  payer_said: string | null;
  split: {
    split_type: 'equal' | 'treat' | 'personal' | 'percent' | 'amount';
    members: { id: string; value: number | null }[];
    scope: 'all' | 'subset';
    source: 'spoken' | 'default';
    persist: boolean;
    unresolved_names: string[];
  };
  category_id: string | null;
  description: string;
  merchant: string | null;
  date: string | null;
  date_source: 'spoken' | 'default';
  notes: string[];
};

export type VoiceParseResult = {
  transcript: string;
  language: string;
  intent: 'expense' | 'settlement' | 'not_expense' | 'unclear';
  items: VoiceParsedItem[];
};

/** The split a member's next voice expense uses when none is said (kept per trip on this device). */
export type StoredSplit =
  | { type: 'equal'; scope: 'all' }
  | { type: 'equal'; scope: 'subset'; memberIds: string[] }
  | { type: 'personal'; memberId: string }
  | { type: 'percent'; percents: Record<string, number> };

export type VoiceDraft = {
  kind: 'expense' | 'settlement';
  /** In the currency's main units (85, 120000); null: not heard (needs_amount). */
  amount: number | null;
  /** The amount was multiplied by 1,000 (a zero-heavy currency said without "thousand"): what was said. */
  scaledFrom: number | null;
  currency: string;
  /** Member id; null = paid from joint money. */
  payerId: string | null;
  /** A name said for the payer that matches nobody on the trip. */
  payerSaid: string | null;
  split: SplitConfig;
  /** Keep this split as the default for the next ones. */
  persist: boolean;
  /** The split to remember when `persist` (equal over everyone stays "everyone", so later members are included). */
  stored: StoredSplit | null;
  categoryId: string;
  description: string;
  merchant: string | null;
  date: string;
  sources: FieldSources;
  notes: string[];
  /** Names said that are not on the trip (left out of the split). */
  unknownNames: string[];
  status: 'ready' | 'needs_amount' | 'pending_payer';
};

/** Below this, a bare number in these currencies means thousands ("120" dong is 120,000). */
export const SCALE_FLOOR: Record<string, number> = { VND: 1000, IDR: 1000, KRW: 100 };
const THOUSAND_WORDS = /אלף|אלפים|thousand|\d\s*k\b|nghìn|ngàn|ribu|rb\b|천|만|lakh|million|מיליון/i;

const PERSIST_CUE = /from now on|for the rest of the trip|as usual|מעכשיו|מהיום|מעתה|מכאן והלאה|בדרך כלל|כרגיל/i;
const ONE_OFF_CUE = /just this time|only this time|this once|רק הפעם|הפעם בלבד|חד.פעמי/i;

/**
 * Should a spoken split become the default? Only when it looks like a group
 * decision: an explicit "from now on", or an equal split across 3 or more
 * people. Pairs, personal, treat, amounts and percentages stay one-off.
 */
export function shouldPersist(split: SplitConfig, transcript: string): boolean {
  if (split.type === 'amount' || split.type === 'treat') return false;
  if (ONE_OFF_CUE.test(transcript)) return false;
  if (PERSIST_CUE.test(transcript)) return true;
  return split.type === 'equal' && split.memberIds.length >= 3;
}

/** The stored default as a split for today's members; null when it no longer fits (someone left). */
export function splitFromStored(s: StoredSplit | null | undefined, memberIds: string[]): SplitConfig | null {
  if (!s) return null;
  const ids = new Set(memberIds);
  switch (s.type) {
    case 'equal':
      if (s.scope === 'all') return memberIds.length ? { type: 'equal', memberIds: [...memberIds] } : null;
      return s.memberIds.length && s.memberIds.every((id) => ids.has(id)) ? { type: 'equal', memberIds: [...s.memberIds] } : null;
    case 'personal':
      return ids.has(s.memberId) ? { type: 'personal', memberId: s.memberId } : null;
    case 'percent':
      return Object.keys(s.percents).every((id) => ids.has(id)) ? { type: 'percent', percents: { ...s.percents } } : null;
  }
}

/** What to remember for a split (everyone stays "everyone"). */
export function storedFromSplit(split: SplitConfig, memberIds: string[]): StoredSplit | null {
  switch (split.type) {
    case 'equal': {
      const all = memberIds.length === split.memberIds.length && memberIds.every((id) => split.memberIds.includes(id));
      return all ? { type: 'equal', scope: 'all' } : { type: 'equal', scope: 'subset', memberIds: [...split.memberIds] };
    }
    case 'personal':
      return { type: 'personal', memberId: split.memberId };
    case 'percent':
      return { type: 'percent', percents: { ...split.percents } };
    default:
      return null;
  }
}

/** A bare small number in VND / IDR / KRW is thousands: returns the amount to use and what was said, if scaled. */
export function applyScale(amount: number, currency: string, said: string | null): { amount: number; scaledFrom: number | null } {
  const floor = SCALE_FLOOR[currency];
  if (!floor || amount >= floor || (said && THOUSAND_WORDS.test(said))) return { amount, scaledFrom: null };
  return { amount: amount * 1000, scaledFrom: amount };
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Fills in and checks one parsed item. */
export function resolveVoiceItem(
  x: VoiceParsedItem,
  p: {
    memberIds: string[];
    /** The sender's member id in the trip. */
    meId: string | null;
    defaultCurrency: string;
    isKnownCurrency: (code: string) => boolean;
    lastSplit: StoredSplit | null | undefined;
    categoryIds: ReadonlySet<string>;
    fallbackCategoryId: string;
    todayIso: string;
    transcript: string;
  },
): VoiceDraft {
  const ids = new Set(p.memberIds);
  const notes = x.notes.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().slice(0, 200)).slice(0, 2);
  const unknownNames = [...new Set(x.split?.unresolved_names ?? [])].filter((n) => typeof n === 'string' && n.trim()).slice(0, 5);

  // Currency: as said when we know it, else the trip's
  const said = x.currency_source === 'spoken' && typeof x.currency === 'string' && /^[A-Z]{3}$/.test(x.currency) && p.isKnownCurrency(x.currency);
  const currency = said ? x.currency! : p.defaultCurrency;

  // Amount: missing or unsure means the user types it (the one thing that blocks)
  let amount: number | null = null;
  let scaledFrom: number | null = null;
  const heard = Number(x.amount);
  if (x.amount_source === 'spoken' && Number.isFinite(heard) && heard > 0 && x.amount_confidence === 'high') {
    const decimals = getCurrency(currency).minor_units;
    const scaled = applyScale(heard, currency, x.amount_said);
    amount = Number(new Decimal(scaled.amount).toDecimalPlaces(decimals).toString());
    scaledFrom = scaled.scaledFrom;
    if (!(amount > 0) || amount >= 1e13) amount = null;
  }

  // Payer: a member said, joint money, a name we don't know, or the sender
  let payerId: string | null = p.meId;
  let payerSource: Source = 'default';
  let payerSaid: string | null = null;
  if (x.payer_source === 'spoken' && x.payer === 'joint' && x.kind !== 'settlement') {
    payerId = null;
    payerSource = 'spoken';
  } else if (x.payer_source === 'spoken' && x.payer && ids.has(x.payer)) {
    payerId = x.payer;
    payerSource = 'spoken';
  } else if (x.payer_source === 'unresolved' || (x.payer_source === 'spoken' && x.payer !== null)) {
    // Saved for the sender's eyes only until they say who it was
    payerSaid = (x.payer_said ?? '').trim().slice(0, 40) || '?';
    payerSource = 'unresolved';
  }

  // Split: as said (checked), else the sender's last one, else everyone equally
  const everyone = (): SplitConfig => ({ type: 'equal', memberIds: [...p.memberIds] });
  let split: SplitConfig | null = null;
  let splitSource: Source = 'default';
  if (x.kind === 'settlement') {
    const to = x.split.members.map((m) => m.id).find((id) => ids.has(id) && id !== payerId);
    if (to) {
      split = { type: 'personal', memberId: to };
      splitSource = 'spoken';
    }
  } else if (x.split?.source === 'spoken') {
    split = spokenSplit(x, ids, p.memberIds, payerId, amount, currency);
    if (split) splitSource = 'spoken';
  }
  if (!split) split = splitFromStored(p.lastSplit, p.memberIds) ?? everyone();
  const persist = splitSource === 'spoken' && x.kind !== 'settlement' && shouldPersist(split, p.transcript);

  const categoryOk = !!x.category_id && p.categoryIds.has(x.category_id);
  const dateOk = x.date_source === 'spoken' && isDay(x.date) && x.date! <= p.todayIso;

  const kind = x.kind === 'settlement' && split.type === 'personal' && payerId ? 'settlement' : 'expense';
  return {
    kind,
    amount,
    scaledFrom,
    currency,
    payerId,
    payerSaid,
    split,
    persist,
    stored: persist ? storedFromSplit(split, p.memberIds) : null,
    categoryId: categoryOk ? x.category_id! : p.fallbackCategoryId,
    description: (x.description ?? '').trim().slice(0, 120),
    merchant: typeof x.merchant === 'string' && x.merchant.trim() ? x.merchant.trim().slice(0, 120) : null,
    date: dateOk ? x.date! : p.todayIso,
    sources: {
      amount: amount === null ? 'unresolved' : scaledFrom !== null ? 'inferred' : 'spoken',
      currency: said ? 'spoken' : 'default',
      paid_by: payerSource,
      split: splitSource,
      category: categoryOk ? 'inferred' : 'default',
      date: dateOk ? 'spoken' : 'default',
    },
    notes,
    unknownNames,
    status: amount === null ? 'needs_amount' : payerSource === 'unresolved' ? 'pending_payer' : 'ready',
  };
}

/** The split the speaker described, if it holds together; null falls back to the default. */
function spokenSplit(x: VoiceParsedItem, ids: Set<string>, all: string[], payerId: string | null, amount: number | null, currency: string): SplitConfig | null {
  const s = x.split;
  const members = s.members.filter((m) => ids.has(m.id));
  const unique = [...new Set(members.map((m) => m.id))];
  switch (s.split_type) {
    case 'equal':
      if (s.scope === 'all') return { type: 'equal', memberIds: [...all] };
      return unique.length ? { type: 'equal', memberIds: unique } : null;
    case 'personal':
      return unique.length === 1 ? { type: 'personal', memberId: unique[0] } : unique.length > 1 ? { type: 'equal', memberIds: unique } : null;
    case 'treat':
      return payerId ? { type: 'treat' } : { type: 'equal', memberIds: [...all] };
    case 'percent': {
      const percents: Record<string, number> = {};
      for (const m of members) if (typeof m.value === 'number' && m.value > 0) percents[m.id] = (percents[m.id] ?? 0) + m.value;
      const sum = Object.values(percents).reduce((a, b) => a + b, 0);
      if (Object.keys(percents).length && Math.abs(sum - 100) < 0.01) return { type: 'percent', percents };
      return unique.length ? { type: 'equal', memberIds: unique } : null;
    }
    case 'amount': {
      if (amount === null) return unique.length ? { type: 'equal', memberIds: unique } : null;
      const decimals = getCurrency(currency).minor_units;
      const total = new Decimal(amount).mul(new Decimal(10).pow(decimals)).toNumber();
      const amounts: Record<string, number> = {};
      for (const m of members) {
        if (typeof m.value !== 'number' || !(m.value > 0)) continue;
        amounts[m.id] = (amounts[m.id] ?? 0) + new Decimal(m.value).mul(new Decimal(10).pow(decimals)).round().toNumber();
      }
      const sum = Object.values(amounts).reduce((a, b) => a + b, 0);
      if (Object.keys(amounts).length && sum === total) return { type: 'amount', amounts };
      return unique.length ? { type: 'equal', memberIds: unique } : null;
    }
  }
}

/** Minor units of a draft's amount (null without one). */
export function draftMinor(d: Pick<VoiceDraft, 'amount' | 'currency'>): number | null {
  if (d.amount === null) return null;
  const minor = new Decimal(d.amount).mul(new Decimal(10).pow(getCurrency(d.currency).minor_units));
  return minor.isInteger() && minor.gt(0) ? minor.toNumber() : null;
}

/** The new expense to queue for a resolved voice draft (null without an amount or a rate). */
export function voiceToSaveInput(
  d: VoiceDraft,
  p: {
    clientId: string;
    trip: Pick<Trip, 'id' | 'card_fx_fee_pct'>;
    me: Member | null;
    memberById: Map<string, Member>;
    snapshot: RatesSnapshot | null | undefined;
    paymentMethod: string | null;
    notes: string | null;
    now?: Date;
  },
): (SaveExpenseInput & { client_id: string }) | null {
  const amountMinor = draftMinor(d);
  const r = rateFor(d.currency, p.snapshot);
  if (amountMinor === null || !r) return null;
  const settlement = d.kind === 'settlement';
  const feePct = settlement ? 0 : cardFeeFor(p.paymentMethod, d.currency, HOME_CURRENCY, memberFeePct(d.payerId ? p.memberById.get(d.payerId) : p.me, p.trip));
  return {
    client_id: p.clientId,
    trip_id: p.trip.id,
    kind: d.kind,
    paid_by_member_id: d.payerId,
    amount_minor: amountMinor,
    currency: d.currency,
    fx_rate: r.rate,
    fx_source: r.source,
    fx_rate_date: r.date ?? null,
    fx_fetched_at: d.currency === HOME_CURRENCY ? null : p.snapshot?.fetched_at ?? null,
    fx_is_manual: false,
    category_id: settlement ? null : d.categoryId,
    description: d.description,
    notes: p.notes,
    occurred_at: dateToOccurredAt(d.date, p.now),
    receipt_path: null,
    payment_method: settlement ? null : p.paymentMethod,
    fx_fee_pct: feePct,
    split_type: d.split.type,
    splits: toSplitEntries(d.split, d.payerId),
    source: 'voice',
    merchant: d.merchant,
    field_sources: d.sources,
    // A payer we couldn't match: only the sender sees it until they say who it was
    ...(d.status === 'pending_payer' ? { review_status: 'pending_review' as const } : {}),
  };
}
