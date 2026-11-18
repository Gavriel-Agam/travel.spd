// Smart import ("ייבוא חכם"): expenses read from pasted text or screenshots by
// the smart-parse-expenses Edge Function, completed on the phone, checked by
// the user, then saved through the offline queue like any other new expense.
import type { SaveExpenseInput } from '@/api/queries';
import { getCurrency, HOME_CURRENCY } from './currencies';
import { convertToHomeMinor } from './money';
import { toSplitEntries } from './split';
import { cardFeeFor, countryForCurrency, memberFeePct, withFee } from './taxFree';
import type { Member, RatesSnapshot, Trip } from '@/types/db';

export const SMART_TEXT_MAX = 2500;
export const SMART_IMAGES_MAX = 3;
export const SMART_DAILY_LIMIT = 15;

/** One expense as the Edge Function returns it. */
export type ParsedExpenseCandidate = {
  title: string;
  amount: number;
  currency: string | null;
  category_id: string;
  date: string | null;
  payer_id: string | null;
  split_type: 'personal' | 'equal' | 'fallback';
  needs_review: boolean;
  review_reason?: string;
  /** Someone outside the trip who paid, or was paid for (in the UI language): goes into the expense's notes. */
  note?: string;
  /** Which screenshot it came from (null: the text). */
  image_index?: number | null;
};

export type SmartImportStatus = 'queued_offline' | 'processing' | 'ready_for_review' | 'error';

/** Kept on this device (IndexedDB `pending_smart_imports`) until added or cleared. */
export type SmartImportRecord = {
  id: string;
  trip_id: string;
  created_at: number;
  status: SmartImportStatus;
  raw_text?: string;
  compressed_images?: Blob[];
  parsed_expenses?: ParsedExpenseCandidate[];
  /** An error code (see i18n smartImport.errors). */
  error_message?: string;
};

/** A found expense on the review screen, as the user edits it. */
export type SmartDraft = {
  key: string;
  title: string;
  /** The amount as typed, in `currency`. */
  amountText: string;
  currency: string;
  categoryId: string;
  /** YYYY-MM-DD */
  date: string;
  /** null = joint money. */
  payerId: string | null;
  split: 'equal' | 'personal';
  taxFree: boolean;
  needsReview: boolean;
  reviewReason?: string;
  /** Saved as the expense's notes (e.g. someone outside the trip paid). */
  notes: string;
  /** Fields the phone filled in (not read from the source): shown with a warning border. */
  guessed: { currency: boolean; date: boolean; payer: boolean };
  imageIndex: number | null;
};

/**
 * Completes what the parser couldn't tell:
 * - no payer, a payer not on the trip, or no clear split: the payer and split
 *   of the last expense saved in this trip (none yet: joint money, equal);
 * - no currency: the trip's default currency (still flagged for review);
 * - no date: today.
 */
export function enrichCandidates(
  list: ParsedExpenseCandidate[],
  p: {
    members: readonly Pick<Member, 'id'>[];
    defaultCurrency: string;
    todayIso: string;
    lastPayer: string | undefined;
    lastSplit: 'equal' | 'personal' | undefined;
    categoryIds: ReadonlySet<string>;
    fallbackCategoryId: string;
  },
): SmartDraft[] {
  const ids = new Set(p.members.map((m) => m.id));
  const lastPayer = p.lastPayer && ids.has(p.lastPayer) ? p.lastPayer : null;
  return list.map((x, i) => {
    const payerKnown = !!x.payer_id && ids.has(x.payer_id);
    const useLast = !payerKnown || x.split_type === 'fallback';
    const payerId = useLast ? lastPayer : x.payer_id;
    const split = payerId === null ? 'equal' : useLast ? p.lastSplit ?? 'equal' : x.split_type === 'personal' ? 'personal' : 'equal';
    const currency = x.currency && /^[A-Z]{3}$/.test(x.currency) ? x.currency : p.defaultCurrency;
    const decimals = getCurrency(currency).minor_units;
    return {
      key: `${i}-${Math.random().toString(36).slice(2, 8)}`,
      title: x.title.trim(),
      amountText: String(Number(x.amount.toFixed(decimals))),
      currency,
      categoryId: p.categoryIds.has(x.category_id) ? x.category_id : p.fallbackCategoryId,
      date: x.date ?? p.todayIso,
      payerId,
      split,
      taxFree: false,
      needsReview: x.needs_review || !x.currency,
      reviewReason: x.review_reason,
      notes: x.note?.trim() ?? '',
      guessed: { currency: !x.currency, date: !x.date, payer: useLast },
      imageIndex: x.image_index ?? null,
    };
  });
}

/** The rate for a currency from a snapshot: { rate, source, date } or null when unknown. */
export function rateFor(currency: string, snapshot: RatesSnapshot | null | undefined) {
  if (currency === HOME_CURRENCY) return { rate: '1', source: 'par', date: null as string | null };
  const e = snapshot?.rates[currency];
  return e ? { rate: e.rate, source: e.source, date: e.date as string | null } : null;
}

/** Home amount (with the payer's card fee) and the fee, or null without a rate. */
export function draftHome(
  amountMinor: number,
  d: Pick<SmartDraft, 'currency' | 'payerId'>,
  p: { snapshot: RatesSnapshot | null | undefined; paymentMethod: string | null; trip: Pick<Trip, 'card_fx_fee_pct'>; me: Member | null; memberById: Map<string, Member> },
): { homeMinor: number; feePct: number } | null {
  const r = rateFor(d.currency, p.snapshot);
  if (!r) return null;
  const feePct = cardFeeFor(p.paymentMethod, d.currency, HOME_CURRENCY, memberFeePct(d.payerId ? p.memberById.get(d.payerId) : p.me, p.trip));
  return { homeMinor: withFee(convertToHomeMinor(amountMinor, d.currency, r.rate), feePct), feePct };
}

/** A local noon on that day: safely inside the same day in the trip's time zone. */
export function dateToOccurredAt(date: string, now = new Date()): string {
  const [y, m, d] = date.split('-').map(Number);
  const today = now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d;
  return (today ? now : new Date(y, m - 1, d, 12, 0, 0)).toISOString();
}

/** The new expense to queue for a checked draft. */
export function draftToSaveInput(
  d: SmartDraft,
  amountMinor: number,
  p: {
    clientId: string;
    trip: Pick<Trip, 'id' | 'card_fx_fee_pct' | 'countries'>;
    members: readonly Pick<Member, 'id'>[];
    me: Member | null;
    memberById: Map<string, Member>;
    snapshot: RatesSnapshot | null | undefined;
    paymentMethod: string | null;
    receiptPath: string | null;
    now?: Date;
  },
): (SaveExpenseInput & { client_id: string }) | null {
  const r = rateFor(d.currency, p.snapshot);
  const home = draftHome(amountMinor, d, p);
  if (!r || !home) return null;
  const all = p.members.map((m) => m.id);
  const config =
    d.payerId === null || d.split === 'equal' ? ({ type: 'equal', memberIds: all } as const) : ({ type: 'personal', memberId: d.payerId } as const);
  return {
    client_id: p.clientId,
    trip_id: p.trip.id,
    kind: 'expense',
    paid_by_member_id: d.payerId,
    amount_minor: amountMinor,
    currency: d.currency,
    fx_rate: r.rate,
    fx_source: r.source,
    fx_rate_date: r.date ?? null,
    fx_fetched_at: d.currency === HOME_CURRENCY ? null : p.snapshot?.fetched_at ?? null,
    fx_is_manual: false,
    category_id: d.categoryId,
    description: d.title.trim(),
    notes: d.notes.trim() || null,
    occurred_at: dateToOccurredAt(d.date, p.now),
    receipt_path: p.receiptPath,
    payment_method: p.paymentMethod,
    fx_fee_pct: home.feePct,
    tax_free: d.taxFree,
    vat_country: d.taxFree ? countryForCurrency(d.currency, p.trip.countries ?? []) : null,
    split_type: config.type,
    splits: toSplitEntries(config, d.payerId),
  };
}
