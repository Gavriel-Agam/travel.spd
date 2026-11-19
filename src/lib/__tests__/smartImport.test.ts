import { describe, expect, it } from 'vitest';
import { dateToOccurredAt, draftToSaveInput, enrichCandidates, type ParsedExpenseCandidate } from '../smartImport';
import { smartImportBadge } from '@/store/smartImports';
import { payerOrder } from '../split';
import type { Member, RatesSnapshot } from '@/types/db';

const members = [{ id: 'a' }, { id: 'b' }];
const base = {
  members,
  defaultCurrency: 'THB',
  todayIso: '2026-11-16',
  lastPayer: 'b' as string | undefined,
  lastSplit: 'personal' as const,
  categoryIds: new Set(['food', 'other']),
  fallbackCategoryId: 'other',
};
const cand = (p: Partial<ParsedExpenseCandidate>): ParsedExpenseCandidate => ({
  title: 'Taxi',
  amount: 350,
  currency: 'THB',
  category_id: 'food',
  date: '2026-11-15',
  payer_id: 'a',
  split_type: 'equal',
  needs_review: false,
  ...p,
});

describe('enrichCandidates', () => {
  it('keeps what the parser read', () => {
    const [d] = enrichCandidates([cand({})], base);
    expect(d).toMatchObject({ payerId: 'a', split: 'equal', currency: 'THB', date: '2026-11-15', categoryId: 'food', needsReview: false });
    expect(d.guessed).toEqual({ currency: false, date: false, payer: false });
  });

  it('no payer, unknown payer or fallback split: last payer and split', () => {
    for (const p of [{ payer_id: null }, { payer_id: 'zzz' }, { split_type: 'fallback' as const }]) {
      const [d] = enrichCandidates([cand(p)], base);
      expect(d).toMatchObject({ payerId: 'b', split: 'personal' });
      expect(d.guessed.payer).toBe(true);
      expect(d.needsReview).toBe(false);
    }
  });

  it('last payer gone or never set: joint money, shared equally', () => {
    const [d] = enrichCandidates([cand({ payer_id: null })], { ...base, lastPayer: 'gone' });
    expect(d).toMatchObject({ payerId: null, split: 'equal' });
    const [e] = enrichCandidates([cand({ payer_id: null })], { ...base, lastPayer: 'joint' });
    expect(e.payerId).toBeNull();
  });

  it('no currency: the trip default, not flagged; no date: today', () => {
    const [d] = enrichCandidates([cand({ currency: null, date: null })], base);
    expect(d).toMatchObject({ currency: 'THB', date: '2026-11-16', needsReview: false });
    expect(d.guessed).toMatchObject({ currency: true, date: true });
  });

  it('unknown category falls back; amount keeps the currency decimals', () => {
    const [d] = enrichCandidates([cand({ category_id: 'x', currency: 'USD', amount: 12.345 })], base);
    expect(d.categoryId).toBe('other');
    expect(d.amountText).toBe('12.35');
  });
});

describe('notes about people outside the trip', () => {
  it('the parser note becomes the expense notes', () => {
    const [d] = enrichCandidates([cand({ note: 'שולם על ידי יוסי' })], base);
    expect(d.notes).toBe('שולם על ידי יוסי');
    const [e] = enrichCandidates([cand({})], base);
    expect(e.notes).toBe('');
  });
});

describe('draftToSaveInput', () => {
  const snap: RatesSnapshot = { requested_date: '2026-11-15', fetched_at: '2026-11-15T08:00:00Z', rates: { THB: { rate: '0.1', date: '2026-11-15', source: 'ecb' } } };
  const me = { id: 'a', card_fx_fee_pct: 2 } as Member;
  const memberById = new Map<string, Member>([
    ['a', me],
    ['b', { id: 'b', card_fx_fee_pct: null } as Member],
  ]);
  const trip = { id: 't', card_fx_fee_pct: null, countries: ['TH'] };
  const [draft] = enrichCandidates([cand({})], base);

  it('builds a new expense with the rate, payer fee and equal split', () => {
    const p = draftToSaveInput(draft, 35000, { clientId: 'c1', trip, members, me, memberById, snapshot: snap, paymentMethod: 'card', receiptPath: 'r.jpg' })!;
    expect(p).toMatchObject({
      client_id: 'c1',
      paid_by_member_id: 'a',
      amount_minor: 35000,
      currency: 'THB',
      fx_rate: '0.1',
      fx_source: 'ecb',
      fx_fee_pct: 2,
      split_type: 'equal',
      receipt_path: 'r.jpg',
      tax_free: false,
      vat_country: null,
      notes: null,
    });
    expect(p.splits.map((s) => s.member_id).sort()).toEqual(['a', 'b']);
  });

  it('personal goes to the payer; tax free gets the country', () => {
    const p = draftToSaveInput({ ...draft, payerId: 'b', split: 'personal', taxFree: true, notes: ' Paid for Dana ' }, 100, { clientId: 'c2', trip, members, me, memberById, snapshot: snap, paymentMethod: 'cash', receiptPath: null })!;
    expect(p).toMatchObject({ split_type: 'personal', splits: [{ member_id: 'b' }], fx_fee_pct: 0, vat_country: 'TH', notes: 'Paid for Dana' });
  });

  it('no rate: nothing to save', () => {
    expect(draftToSaveInput({ ...draft, currency: 'JPY' }, 100, { clientId: 'c', trip, members, me, memberById, snapshot: snap, paymentMethod: null, receiptPath: null })).toBeNull();
  });
});

describe('dateToOccurredAt / smartImportBadge', () => {
  it('today keeps the time; another day is local noon', () => {
    const now = new Date(2026, 10, 16, 9, 30);
    expect(dateToOccurredAt('2026-11-16', now)).toBe(now.toISOString());
    expect(dateToOccurredAt('2026-11-10', now)).toBe(new Date(2026, 10, 10, 12).toISOString());
  });

  it('ready beats queued beats error, per trip', () => {
    const r = (trip_id: string, status: 'queued_offline' | 'ready_for_review' | 'error') => ({ id: Math.random().toString(), trip_id, created_at: 0, status });
    expect(smartImportBadge([r('t', 'error'), r('t', 'queued_offline')], 't')).toBe('queued');
    expect(smartImportBadge([r('t', 'queued_offline'), r('t', 'ready_for_review')], 't')).toBe('ready');
    expect(smartImportBadge([r('x', 'ready_for_review')], 't')).toBeNull();
  });
});

describe('payerOrder', () => {
  it('you first, the others in trip order', () => {
    expect(payerOrder([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b').map((m) => m.id)).toEqual(['b', 'a', 'c']);
    expect(payerOrder([{ id: 'a' }, { id: 'b' }], null).map((m) => m.id)).toEqual(['a', 'b']);
  });
});
