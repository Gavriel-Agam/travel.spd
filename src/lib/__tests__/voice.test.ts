import { describe, expect, it } from 'vitest';
import { applyScale, draftMinor, resolveVoiceItem, shouldPersist, splitFromStored, storedFromSplit, voiceToSaveInput, type VoiceParsedItem } from '../voice';
import type { Member, RatesSnapshot } from '@/types/db';

// Gabriel (me), Tal, Danny, Yoav
const ME = 'g';
const all = ['g', 't', 'd', 'y'];
const base = {
  memberIds: all,
  meId: ME,
  defaultCurrency: 'THB',
  isKnownCurrency: (c: string) => ['THB', 'VND', 'IDR', 'USD', 'ILS', 'EUR'].includes(c),
  lastSplit: { type: 'equal', scope: 'all' } as const,
  categoryIds: new Set(['food', 'transport', 'activities', 'other']),
  fallbackCategoryId: 'other',
  todayIso: '2026-11-23',
  transcript: '',
};
const item = (p: Omit<Partial<VoiceParsedItem>, 'split'> & { split?: Partial<VoiceParsedItem['split']> } = {}): VoiceParsedItem => ({
  kind: 'expense',
  amount: 85,
  amount_said: '85',
  amount_source: 'spoken',
  amount_confidence: 'high',
  currency: null,
  currency_source: 'default',
  payer: null,
  payer_source: 'default',
  payer_said: null,
  category_id: 'food',
  description: 'Breakfast',
  merchant: null,
  date: null,
  date_source: 'default',
  notes: [],
  ...p,
  split: { split_type: 'equal', members: [], scope: 'all', source: 'default', persist: false, unresolved_names: [], ...p.split },
});

describe('resolveVoiceItem: the brief examples', () => {
  it('"Paid 85 for breakfast": everything but the amount from defaults', () => {
    const d = resolveVoiceItem(item({ payer: 'g', payer_source: 'spoken' }), { ...base, transcript: 'Paid 85 for breakfast' });
    expect(d).toMatchObject({ amount: 85, currency: 'THB', payerId: 'g', status: 'ready', persist: false, categoryId: 'food', date: '2026-11-23' });
    expect(d.split).toEqual({ type: 'equal', memberIds: all });
    expect(d.sources).toEqual({ amount: 'spoken', currency: 'default', paid_by: 'spoken', split: 'default', category: 'inferred', date: 'default' });
  });

  it('"Tal paid 200 baht for a boat for me and her": pair split, not kept as the default', () => {
    const d = resolveVoiceItem(
      item({ amount: 200, currency: 'THB', currency_source: 'spoken', payer: 't', payer_source: 'spoken', category_id: 'activities', split: { scope: 'subset', source: 'spoken', persist: true, members: [{ id: 'g', value: null }, { id: 't', value: null }] } }),
      { ...base, transcript: 'Tal paid 200 baht for a boat for me and her' },
    );
    expect(d).toMatchObject({ payerId: 't', persist: false, stored: null, status: 'ready' });
    expect(d.split).toEqual({ type: 'equal', memberIds: ['g', 't'] });
    expect(d.sources.split).toBe('spoken');
  });

  it('"120 thousand dong ... me, Danny and Yoav": three people, kept as the default', () => {
    const d = resolveVoiceItem(
      item({ amount: 120000, amount_said: '120 thousand', currency: 'VND', currency_source: 'spoken', payer: 'g', payer_source: 'spoken', split: { scope: 'subset', source: 'spoken', members: ['g', 'd', 'y'].map((id) => ({ id, value: null })) } }),
      { ...base, transcript: 'Spent 120 thousand dong on a taxi to the airport, split equally between me, Danny, and Yoav' },
    );
    expect(d).toMatchObject({ amount: 120000, currency: 'VND', scaledFrom: null, persist: true });
    expect(d.stored).toEqual({ type: 'equal', scope: 'subset', memberIds: ['g', 'd', 'y'] });
  });
});

describe('resolveVoiceItem: defaults and checks', () => {
  it('no payer said: the sender; no split: the last one, else everyone', () => {
    const last = resolveVoiceItem(item(), { ...base, lastSplit: { type: 'equal', scope: 'subset', memberIds: ['g', 't'] } });
    expect(last.payerId).toBe(ME);
    expect(last.sources.paid_by).toBe('default');
    expect(last.split).toEqual({ type: 'equal', memberIds: ['g', 't'] });
    // Someone in the remembered split has left: everyone
    const gone = resolveVoiceItem(item(), { ...base, lastSplit: { type: 'equal', scope: 'subset', memberIds: ['g', 'x'] } });
    expect(gone.split).toEqual({ type: 'equal', memberIds: all });
    const none = resolveVoiceItem(item(), { ...base, lastSplit: undefined });
    expect(none.split).toEqual({ type: 'equal', memberIds: all });
  });

  it('no amount, or an unsure one: needs_amount (the only thing that blocks)', () => {
    expect(resolveVoiceItem(item({ amount: null, amount_source: 'missing' }), base)).toMatchObject({ status: 'needs_amount', amount: null });
    expect(resolveVoiceItem(item({ amount_confidence: 'low' }), base)).toMatchObject({ status: 'needs_amount', amount: null });
    expect(resolveVoiceItem(item({ amount: -5 }), base).status).toBe('needs_amount');
  });

  it('a payer name not on the trip: pending_payer, the sender as placeholder', () => {
    const d = resolveVoiceItem(item({ payer: null, payer_source: 'unresolved', payer_said: 'Dani' }), base);
    expect(d).toMatchObject({ status: 'pending_payer', payerId: ME, payerSaid: 'Dani' });
    // An id the model made up is treated the same
    expect(resolveVoiceItem(item({ payer: 'zzz', payer_source: 'spoken', payer_said: 'Zed' }), base).status).toBe('pending_payer');
  });

  it('joint money: no payer', () => {
    const d = resolveVoiceItem(item({ payer: 'joint', payer_source: 'spoken' }), base);
    expect(d).toMatchObject({ payerId: null, status: 'ready' });
    expect(d.sources.paid_by).toBe('spoken');
  });

  it('unknown currency or category, future date: the defaults', () => {
    const d = resolveVoiceItem(item({ currency: 'XYZ', currency_source: 'spoken', category_id: 'made-up', date: '2026-12-01', date_source: 'spoken' }), base);
    expect(d).toMatchObject({ currency: 'THB', categoryId: 'other', date: '2026-11-23' });
    expect(d.sources).toMatchObject({ currency: 'default', category: 'default', date: 'default' });
    expect(resolveVoiceItem(item({ date: '2026-11-22', date_source: 'spoken' }), base).date).toBe('2026-11-22');
  });

  it('amount rounded to the currency decimals', () => {
    expect(resolveVoiceItem(item({ amount: 85.555, currency: 'USD', currency_source: 'spoken' }), base).amount).toBe(85.56);
    expect(resolveVoiceItem(item({ amount: 1200.4, currency: 'VND', currency_source: 'spoken' }), base).amount).toBe(1200);
  });

  it('personal, treat, percent and exact amounts', () => {
    expect(resolveVoiceItem(item({ split: { split_type: 'personal', source: 'spoken', scope: 'subset', members: [{ id: 'g', value: null }] } }), base).split).toEqual({ type: 'personal', memberId: 'g' });
    expect(resolveVoiceItem(item({ split: { split_type: 'treat', source: 'spoken' } }), base).split).toEqual({ type: 'treat' });
    // Treat from joint money makes no sense: everyone
    expect(resolveVoiceItem(item({ payer: 'joint', payer_source: 'spoken', split: { split_type: 'treat', source: 'spoken' } }), base).split.type).toBe('equal');
    const pct = resolveVoiceItem(item({ split: { split_type: 'percent', source: 'spoken', scope: 'subset', members: [{ id: 'g', value: 70 }, { id: 't', value: 30 }] } }), base);
    expect(pct.split).toEqual({ type: 'percent', percents: { g: 70, t: 30 } });
    const badPct = resolveVoiceItem(item({ split: { split_type: 'percent', source: 'spoken', scope: 'subset', members: [{ id: 'g', value: 70 }, { id: 't', value: 20 }] } }), base);
    expect(badPct.split).toEqual({ type: 'equal', memberIds: ['g', 't'] });
    const amt = resolveVoiceItem(item({ amount: 100, split: { split_type: 'amount', source: 'spoken', scope: 'subset', members: [{ id: 'g', value: 60 }, { id: 't', value: 40 }] } }), base);
    expect(amt.split).toEqual({ type: 'amount', amounts: { g: 6000, t: 4000 } });
    const badAmt = resolveVoiceItem(item({ amount: 100, split: { split_type: 'amount', source: 'spoken', scope: 'subset', members: [{ id: 'g', value: 60 }, { id: 't', value: 30 }] } }), base);
    expect(badAmt.split).toEqual({ type: 'equal', memberIds: ['g', 't'] });
  });

  it('spoken split with nobody we know: the default', () => {
    const d = resolveVoiceItem(item({ split: { scope: 'subset', source: 'spoken', members: [{ id: 'zzz', value: null }], unresolved_names: ['cousin'] } }), base);
    expect(d.split).toEqual({ type: 'equal', memberIds: all });
    expect(d.sources.split).toBe('default');
    expect(d.unknownNames).toEqual(['cousin']);
  });

  it('settlement: payer to one other member, never kept as a split default', () => {
    const d = resolveVoiceItem(item({ kind: 'settlement', amount: 300, payer: 'g', payer_source: 'spoken', split: { split_type: 'personal', source: 'spoken', scope: 'subset', members: [{ id: 't', value: null }] } }), { ...base, transcript: 'I paid Tal back 300' });
    expect(d).toMatchObject({ kind: 'settlement', payerId: 'g', persist: false });
    expect(d.split).toEqual({ type: 'personal', memberId: 't' });
    // No one to pay back: an ordinary expense
    expect(resolveVoiceItem(item({ kind: 'settlement', split: { split_type: 'personal', source: 'spoken', members: [] } }), base).kind).toBe('expense');
  });
});

describe('scale and persistence rules', () => {
  it('bare small numbers in VND / IDR / KRW are thousands', () => {
    expect(applyScale(120, 'VND', '120')).toEqual({ amount: 120000, scaledFrom: 120 });
    expect(applyScale(120, 'VND', '120 אלף')).toEqual({ amount: 120, scaledFrom: null });
    expect(applyScale(50000, 'IDR', '50000')).toEqual({ amount: 50000, scaledFrom: null });
    expect(applyScale(85, 'THB', '85')).toEqual({ amount: 85, scaledFrom: null });
    const d = resolveVoiceItem(item({ amount: 120, amount_said: 'מאה עשרים', currency: 'VND', currency_source: 'spoken' }), base);
    expect(d).toMatchObject({ amount: 120000, scaledFrom: 120 });
    expect(d.sources.amount).toBe('inferred');
  });

  it('kept as default: explicit cue or 3+ equal; never amounts or treat; "just this time" wins', () => {
    const pair = { type: 'equal' as const, memberIds: ['g', 't'] };
    expect(shouldPersist(pair, 'for me and Tal')).toBe(false);
    expect(shouldPersist(pair, 'מעכשיו לי ולטל')).toBe(true);
    expect(shouldPersist({ type: 'equal', memberIds: ['g', 't', 'd'] }, 'split three ways')).toBe(true);
    expect(shouldPersist({ type: 'equal', memberIds: ['g', 't', 'd'] }, 'רק הפעם בינינו השלושה')).toBe(false);
    expect(shouldPersist({ type: 'amount', amounts: { g: 1 } }, 'from now on')).toBe(false);
    expect(shouldPersist({ type: 'treat' }, 'from now on')).toBe(false);
  });

  it('stored split round trip; everyone stays everyone (a new member is included)', () => {
    expect(storedFromSplit({ type: 'equal', memberIds: [...all] }, all)).toEqual({ type: 'equal', scope: 'all' });
    expect(splitFromStored({ type: 'equal', scope: 'all' }, [...all, 'n'])).toEqual({ type: 'equal', memberIds: [...all, 'n'] });
    expect(splitFromStored(storedFromSplit({ type: 'personal', memberId: 't' }, all), all)).toEqual({ type: 'personal', memberId: 't' });
    expect(splitFromStored({ type: 'personal', memberId: 'gone' }, all)).toBeNull();
    expect(storedFromSplit({ type: 'treat' }, all)).toBeNull();
  });
});

describe('voiceToSaveInput', () => {
  const snapshot = { fetched_at: '2026-11-23T08:00:00Z', rates: { THB: { rate: '0.1', source: 'boi', date: '2026-11-23' } } } as unknown as RatesSnapshot;
  const me = { id: 'g', card_fx_fee_pct: null } as unknown as Member;
  const p = { clientId: 'c1', trip: { id: 'trip', card_fx_fee_pct: null }, me, memberById: new Map([['g', me]]), snapshot, paymentMethod: null, notes: null, now: new Date('2026-11-23T10:00:00Z') };

  it('a ready draft becomes a voice expense with its field sources', () => {
    const d = resolveVoiceItem(item(), base);
    const s = voiceToSaveInput(d, p)!;
    expect(s).toMatchObject({ client_id: 'c1', amount_minor: 8500, currency: 'THB', fx_rate: '0.1', paid_by_member_id: 'g', split_type: 'equal', source: 'voice', category_id: 'food' });
    expect(s.splits).toEqual(all.map((member_id) => ({ member_id })));
    expect(s.field_sources).toEqual(d.sources);
    expect(s).not.toHaveProperty('review_status');
  });

  it('unknown payer: saved for the sender only; no amount or no rate: nothing', () => {
    expect(voiceToSaveInput(resolveVoiceItem(item({ payer_source: 'unresolved', payer_said: 'Dani' }), base), p)!.review_status).toBe('pending_review');
    expect(voiceToSaveInput(resolveVoiceItem(item({ amount: null, amount_source: 'missing' }), base), p)).toBeNull();
    expect(voiceToSaveInput(resolveVoiceItem(item({ currency: 'EUR', currency_source: 'spoken' }), base), p)).toBeNull();
  });

  it('settlement: no category or payment method', () => {
    const d = resolveVoiceItem(item({ kind: 'settlement', amount: 300, split: { split_type: 'personal', source: 'spoken', members: [{ id: 't', value: null }] } }), base);
    expect(voiceToSaveInput(d, p)).toMatchObject({ kind: 'settlement', category_id: null, payment_method: null, split_type: 'personal', splits: [{ member_id: 't' }] });
  });

  it('draftMinor', () => {
    expect(draftMinor({ amount: 85.5, currency: 'THB' })).toBe(8550);
    expect(draftMinor({ amount: 120000, currency: 'VND' })).toBe(120000);
    expect(draftMinor({ amount: null, currency: 'THB' })).toBeNull();
  });
});
