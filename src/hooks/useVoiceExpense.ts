// Voice expenses: send a recording (or a typed sentence) to voice-parse,
// complete what it heard with fixed rules (lib/voice), queue the expenses like
// any new expense (on the list at once, sent now or when back online), and
// show the confirmation card. Undo takes them back and restores the default
// split they changed.
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef } from 'react';
import { fetchRates, keys } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useOnline } from '@/hooks/useOutboxSync';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { isNetworkError } from '@/lib/connectivity';
import { allCurrencies } from '@/lib/currencies';
import { logError } from '@/lib/log';
import { parseAmount } from '@/lib/money';
import { lastPaymentFor } from '@/lib/payments';
import { dayKey } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { resolveVoiceItem, splitFromStored, voiceToSaveInput, type VoiceDraft, type VoiceParseResult } from '@/lib/voice';
import { useUserId } from '@/providers/AuthProvider';
import { useOutbox } from '@/store/outbox';
import { capturePlace } from '@/hooks/useExpenseLocation';
import { cachedRatesFor, useIsDemo, usePrefs } from '@/store/prefs';
import { useVoice, type CardItem, type VoiceCapture } from '@/store/voice';
import type { Expense, RatesSnapshot } from '@/types/db';

type Deps = {
  data: ReturnType<typeof useTripData>;
  userId: string | null;
  lang: string;
  t: ReturnType<typeof useT>['t'];
  qc: QueryClient;
};

/** What voice-parse is told about the trip. */
function contextFor({ data, lang, t }: Deps) {
  const { trip, members, categories, me } = data;
  if (!trip || !members.length || !categories.length) return null;
  const stored = usePrefs.getState().voiceSplit[trip.id];
  const ids = members.map((m) => m.id);
  const last = splitFromStored(stored, ids);
  const now = new Date();
  return {
    default_currency: trip.default_currency,
    countries: trip.countries ?? [],
    today_iso: dayKey(now, trip.timezone),
    now_local: `${dayKey(now, trip.timezone)}T${now.toLocaleTimeString('en-GB', { timeZone: trip.timezone, hour: '2-digit', minute: '2-digit' })}`,
    timezone: trip.timezone,
    ui_language: lang === 'en' ? 'en' : 'he',
    sender_id: me?.id ?? null,
    participants: members.map((m) => ({ id: m.id, name: m.display_name })),
    categories: categories.map((c) => ({ id: c.id, name: categoryLabel(c, t) })),
    last_split: last
      ? {
          split_type: last.type,
          member_ids: last.type === 'equal' ? last.memberIds : last.type === 'personal' ? [last.memberId] : last.type === 'percent' ? Object.keys(last.percents) : ids,
          scope: stored?.type === 'equal' && stored.scope === 'all' ? 'all' : 'subset',
        }
      : null,
  };
}

async function snapshotFor(qc: QueryClient, date: string): Promise<RatesSnapshot | null> {
  try {
    return (await qc.fetchQuery({ queryKey: keys.rates(date), queryFn: () => fetchRates(date), staleTime: 30 * 60_000 })) as RatesSnapshot;
  } catch {
    return cachedRatesFor(usePrefs.getState().rates, date);
  }
}

/** Notes kept on the expense: what to check, in the app's language. */
function notesFor(d: VoiceDraft, t: Deps['t']) {
  const lines = [...d.notes];
  if (d.payerSaid) lines.push(t('voice.notePayer', { name: d.payerSaid }));
  if (d.unknownNames.length) lines.push(t('voice.noteUnknown', { names: d.unknownNames.join(', ') }));
  return lines.join('\n').slice(0, 500) || null;
}

/** Queues one draft with an amount; false without a rate for its currency. */
async function queueDraft(d: VoiceDraft, deps: Deps, clientId: string, place?: VoiceCapture['place']): Promise<boolean> {
  const { trip, me, memberById } = deps.data;
  if (!trip) return false;
  const prefs = usePrefs.getState();
  const snapshot = await snapshotFor(deps.qc, d.date);
  const payload = voiceToSaveInput(d, {
    clientId,
    trip,
    me,
    memberById,
    snapshot,
    paymentMethod: lastPaymentFor(prefs.lastPayment, prefs.lastPaymentAny, trip.id, trip.payment_methods ?? []),
    notes: notesFor(d, deps.t),
    place,
  });
  if (!payload) return false;
  useOutbox.getState().add({ clientId, tripId: trip.id, createdBy: deps.userId ?? '', queuedAt: new Date().toISOString(), payload });
  return true;
}

/** Place lookups still running for a capture (in memory only). */
const placeLookups = new Map<string, Promise<VoiceCapture['place']>>();

/** Saves the drafts that have an amount, keeps the rest waiting for one, and shows the card. */
async function finish(cap0: VoiceCapture, result: VoiceParseResult, deps: Deps) {
  const store = useVoice.getState();
  // Give a place lookup still running a moment (never more than 1.5 s), then use the latest copy
  const lookup = placeLookups.get(cap0.id);
  if (lookup) await Promise.race([lookup, new Promise((r) => setTimeout(r, 1500))]);
  placeLookups.delete(cap0.id);
  const cap = useVoice.getState().captures.find((c) => c.id === cap0.id) ?? cap0;
  const { trip, members, me, categories } = deps.data;
  if (!trip) return;
  if (!result.items.length) {
    store.patch(cap.id, { status: 'failed', error: 'not_expense', transcript: result.transcript, audio: undefined });
    return;
  }
  const memberIds = members.map((m) => m.id);
  const known = new Set(allCurrencies().map((c) => c.code));
  const prefs = usePrefs.getState();
  const params = {
    memberIds,
    meId: me?.id ?? null,
    defaultCurrency: trip.default_currency,
    isKnownCurrency: (c: string) => known.has(c),
    categoryIds: new Set(categories.map((c) => c.id)),
    fallbackCategoryId: categories.find((c) => c.key === 'other')?.id ?? categories[categories.length - 1].id,
    todayIso: dayKey(new Date(), trip.timezone),
    transcript: result.transcript,
  };
  const items: CardItem[] = [];
  const waiting: VoiceDraft[] = [];
  let noRate = false;
  for (const x of result.items) {
    // Each item sees the default as left by the one before it
    const d = resolveVoiceItem(x, { ...params, lastSplit: usePrefs.getState().voiceSplit[trip.id] });
    if (d.status === 'needs_amount') {
      waiting.push(d);
      continue;
    }
    const clientId = Crypto.randomUUID();
    if (!(await queueDraft(d, deps, clientId, cap.place))) {
      noRate = true;
      waiting.push({ ...d, status: 'needs_amount' });
      continue;
    }
    const item: CardItem = { clientId, draft: d };
    if (d.persist && d.stored) {
      item.prevSplit = usePrefs.getState().voiceSplit[trip.id] ?? null;
      prefs.setVoiceSplit(trip.id, d.stored);
    }
    items.push(item);
  }
  // The first item still waiting for its amount stays on this capture; any more get their own
  store.remove(cap.id);
  waiting.forEach((d, i) =>
    store.add({
      id: i === 0 ? cap.id : Crypto.randomUUID(),
      tripId: trip.id,
      createdAt: cap.createdAt,
      status: noRate && d.amount !== null ? 'failed' : 'needs_amount',
      error: noRate && d.amount !== null ? 'no_rate' : undefined,
      transcript: result.transcript,
      draft: d,
      place: cap.place,
    }),
  );
  if (items.length) store.showCard({ id: cap.id, tripId: trip.id, transcript: result.transcript, items });
}

/** Sends one capture to be read. Offline: back in the queue. */
async function processCapture(cap: VoiceCapture, deps: Deps) {
  const store = useVoice.getState();
  const ctx = contextFor(deps);
  if (!ctx) return;
  if (!onlineManager.isOnline()) return store.patch(cap.id, { status: 'queued_offline' });
  store.patch(cap.id, { status: 'processing', error: undefined });
  try {
    const { data, error } = await supabase.functions.invoke('voice-parse', {
      body: { trip_id: cap.tripId, client_id: cap.id, ...(cap.audio ? { audio: cap.audio } : { text: cap.text }), context: ctx },
    });
    if (error) {
      const res = (error as { context?: Response }).context;
      if (res && typeof res.status === 'number') {
        let code = 'parse_failed';
        try {
          code = (await res.json())?.error ?? code;
        } catch {
          // not JSON
        }
        return store.patch(cap.id, { status: 'failed', error: res.status === 429 ? 'RATE_LIMIT_EXCEEDED' : code });
      }
      throw error;
    }
    await finish(cap, data as VoiceParseResult, deps);
  } catch (e) {
    if (isNetworkError(e) || !onlineManager.isOnline() || /fetch|network/i.test(String((e as Error)?.message ?? e))) {
      return store.patch(cap.id, { status: 'queued_offline' });
    }
    logError(e, 'voice.parse');
    store.patch(cap.id, { status: 'failed', error: 'parse_failed' });
  }
}

function useDeps(): React.MutableRefObject<Deps> {
  const data = useTripData();
  const userId = useUserId();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const ref = useRef<Deps>({ data, userId: userId ?? null, lang, t, qc });
  ref.current = { data, userId: userId ?? null, lang, t, qc };
  return ref;
}

/** Recordings queued offline are sent once the connection is back (mounted once for the trip). */
export function useVoiceSync() {
  const online = useOnline();
  const demo = useIsDemo();
  const deps = useDeps();
  const running = useRef(false);
  const tripId = deps.current.data.trip?.id;
  const queued = useVoice((s) => s.captures.filter((c) => c.status === 'queued_offline' && c.tripId === tripId).length);
  const ready = !!contextFor(deps.current);

  useEffect(() => {
    if (!online || !queued || demo || !ready || running.current) return;
    running.current = true;
    (async () => {
      try {
        for (const cap of useVoice.getState().captures.filter((c) => c.status === 'queued_offline' && c.tripId === tripId)) {
          await processCapture(cap, deps.current);
          if (!onlineManager.isOnline()) break;
        }
      } finally {
        running.current = false;
      }
    })();
  }, [online, queued, demo, ready, tripId]);
}

/** What the record button, the waiting rows and the card can do. */
export function useVoiceExpense() {
  const deps = useDeps();

  /** A finished recording or typed sentence: on the list at once, read now (or when back online). */
  const submit = useCallback(async (input: { audio?: { mime: string; data: string }; text?: string; durationMs?: number }) => {
    const trip = deps.current.data.trip;
    if (!trip) return;
    const cap: VoiceCapture = { id: Crypto.randomUUID(), tripId: trip.id, createdAt: new Date().toISOString(), status: 'processing', ...input };
    useVoice.getState().add(cap);
    // Where it was recorded: looked up alongside the reading, never waited for beyond it
    const placed = capturePlace(deps.current.lang).then((place) => {
      if (place) useVoice.getState().patch(cap.id, { place });
      return place;
    });
    placeLookups.set(cap.id, placed);
    await processCapture(cap, deps.current);
  }, []);

  const retry = useCallback(async (id: string) => {
    const cap = useVoice.getState().captures.find((c) => c.id === id);
    if (!cap) return;
    // Heard but not saved (no rate): try saving again; otherwise read it again
    if (cap.draft && cap.draft.amount !== null) return completeDraft(cap, cap.draft);
    if (cap.audio || cap.text) await processCapture(cap, deps.current);
  }, []);

  const discard = useCallback((id: string) => useVoice.getState().remove(id), []);

  async function completeDraft(cap: VoiceCapture, d: VoiceDraft) {
    const clientId = Crypto.randomUUID();
    const store = useVoice.getState();
    if (!(await queueDraft(d, deps.current, clientId, cap.place))) return store.patch(cap.id, { status: 'failed', error: 'no_rate', draft: d });
    const trip = deps.current.data.trip!;
    const item: CardItem = { clientId, draft: d };
    if (d.persist && d.stored) {
      item.prevSplit = usePrefs.getState().voiceSplit[trip.id] ?? null;
      usePrefs.getState().setVoiceSplit(trip.id, d.stored);
    }
    store.remove(cap.id);
    store.showCard({ id: cap.id, tripId: cap.tripId, transcript: cap.transcript ?? '', items: [item] });
  }

  /** The amount typed for a recording that had none. False when it isn't a valid amount. */
  const setAmount = useCallback(async (id: string, text: string) => {
    const cap = useVoice.getState().captures.find((c) => c.id === id);
    if (!cap?.draft) return false;
    const minor = parseAmount(text, cap.draft.currency);
    if (minor === null) return false;
    const amount = Number(text.replace(/[\s,]/g, ''));
    const d: VoiceDraft = {
      ...cap.draft,
      amount,
      scaledFrom: null,
      sources: { ...cap.draft.sources, amount: 'edited' },
      status: cap.draft.payerSaid ? 'pending_payer' : 'ready',
    };
    await completeDraft(cap, d);
    return true;
  }, []);

  /** Takes back everything on the card (queued or saved) and the default split it changed. */
  const undo = useCallback(async () => {
    const { card, showCard } = useVoice.getState();
    if (!card || card.undone) return;
    const { qc, userId } = deps.current;
    const outbox = useOutbox.getState();
    for (const it of card.items) {
      if (it.prevSplit !== undefined) usePrefs.getState().setVoiceSplit(card.tripId, it.prevSplit);
      if (outbox.items.some((i) => i.clientId === it.clientId)) {
        outbox.remove(it.clientId);
        continue;
      }
      const saved = (qc.getQueryData<Expense[]>(keys.expenses(card.tripId)) ?? []).find((e) => e.client_id === it.clientId || e.id === it.clientId);
      if (!saved) continue;
      // Gone from the lists now; deleted on the server now or when back online (restorable from Recently deleted)
      qc.setQueryData<Expense[]>(keys.expenses(card.tripId), (list) => list?.filter((e) => e.id !== saved.id));
      const queue = () =>
        useOutbox.getState().queueDelete({ expenseId: saved.id, expectedVersion: saved.version, tripId: card.tripId, createdBy: userId ?? '', queuedAt: new Date().toISOString(), snapshot: saved });
      if (!onlineManager.isOnline()) {
        queue();
        continue;
      }
      const { error } = await supabase.rpc('delete_expense', { p_id: saved.id, p_expected_version: saved.version });
      if (error) queue();
    }
    qc.invalidateQueries({ queryKey: keys.expenses(card.tripId) });
    showCard({ ...card, undone: true });
  }, []);

  return { submit, retry, discard, setAmount, undo };
}

/** The saved expense behind a card item (the queued one until the server has it). */
export function findCardExpense(list: readonly Expense[], clientId: string): Expense | undefined {
  return list.find((e) => e.id === clientId || e.client_id === clientId);
}
