// Per-device preferences and caches (not shared between partners).
import { persistStorage } from '@/lib/deviceStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RatesSnapshot } from '@/types/db';

type Lang = 'en' | 'he';
/** A Home card's figures: the whole trip, or just your share of it. */
export type HomeView = 'trip' | 'mine';

type PrefsState = {
  lang: Lang | null; // null = follow the device
  activeTripId: string | null;
  lastCurrency: Record<string, string>; // tripId -> code
  /** Payment method used last, per trip (trip id -> method), and in any trip. New expenses start with it. */
  lastPayment: Record<string, string>;
  lastPaymentAny: string | null;
  notePaymentUsed: (tripId: string, method: string) => void;
  /** Who paid the last expense saved, per trip (trip id -> member id, or 'joint'). New expenses start with it. */
  lastPayer: Record<string, string>;
  /** How the last expense saved was split, per trip (Smart import uses it when the text doesn't say). */
  lastSplit: Record<string, 'equal' | 'personal'>;
  noteSplitUsed: (tripId: string, split: 'equal' | 'personal') => void;
  notePayerUsed: (tripId: string, payer: string | null) => void;
  /** Country of the last expense, per trip (trip id -> ISO code). New expenses start there. */
  lastCountry: Record<string, string>;
  noteCountryUsed: (tripId: string, code: string) => void;
  recentCurrencies: string[];
  currencyUsage: Record<string, number>;
  /** Latest rate snapshots by requested date, for offline conversion previews. */
  rates: Record<string, RatesSnapshot>;
  /** Order of the Home cards on this device (see lib/homeLayout). */
  homeOrder: string[] | null;
  /** The order changed on this device and has not reached the account yet (sent again on the next sync). */
  homeOrderDirty: boolean;
  /** What each Home card shows (card key → 'trip' or 'mine'), on this device. */
  homeViews: Record<string, HomeView>;
  setHomeView: (card: string, view: HomeView) => void;
  /** Card order on other screens that can be rearranged (Statistics, Budget), on this device. */
  screenOrders: Record<string, string[]>;
  /** Expenses tab: a day's expenses in the order set by hand, per trip (trip id → day → expense ids). This device only. */
  expenseOrder: Record<string, Record<string, string[]>>;
  setExpenseOrder: (tripId: string, day: string, ids: string[]) => void;
  /** Accounts on this device that were already offered the feedback panel (it opens by itself once per account). */
  feedbackPrompted: string[];
  markFeedbackPrompted: (userId: string) => void;
  /** Guest demo: a read-only sample trip on this device; nothing is sent to the server. */
  demo: boolean;
  setDemo: (demo: boolean) => void;
  setHomeOrder: (order: string[] | null, dirty?: boolean) => void;
  setScreenOrder: (screen: string, order: string[] | null) => void;
  setLang: (lang: Lang) => void;
  setActiveTrip: (id: string | null) => void;
  noteCurrencyUsed: (tripId: string, code: string) => void;
  cacheRates: (snap: RatesSnapshot) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      lang: null,
      activeTripId: null,
      lastCurrency: {},
      lastPayment: {},
      lastPaymentAny: null,
      lastCountry: {},
      lastPayer: {},
      lastSplit: {},
      noteSplitUsed: (tripId, split) => set((s) => ({ lastSplit: { ...s.lastSplit, [tripId]: split } })),
      notePayerUsed: (tripId, payer) => set((s) => ({ lastPayer: { ...s.lastPayer, [tripId]: payer ?? 'joint' } })),
      noteCountryUsed: (tripId, code) => set((s) => ({ lastCountry: { ...s.lastCountry, [tripId]: code } })),
      notePaymentUsed: (tripId, method) => set((s) => ({ lastPayment: { ...s.lastPayment, [tripId]: method }, lastPaymentAny: method })),
      recentCurrencies: [],
      currencyUsage: {},
      rates: {},
      homeOrder: null,
      homeOrderDirty: false,
      screenOrders: {},
      homeViews: {},
      setHomeView: (card, view) => set((s) => ({ homeViews: { ...s.homeViews, [card]: view } })),
      feedbackPrompted: [],
      expenseOrder: {},
      setExpenseOrder: (tripId, day, ids) =>
        set((s) => ({ expenseOrder: { ...s.expenseOrder, [tripId]: { ...s.expenseOrder[tripId], [day]: ids } } })),
      markFeedbackPrompted: (userId) =>
        set((s) => (s.feedbackPrompted.includes(userId) ? s : { feedbackPrompted: [...s.feedbackPrompted, userId].slice(-10) })),
      demo: false,
      setDemo: (demo) => set({ demo }),
      setHomeOrder: (homeOrder, dirty = false) => set({ homeOrder, homeOrderDirty: dirty }),
      setScreenOrder: (screen, order) =>
        set((s) => {
          const next = { ...s.screenOrders };
          if (order) next[screen] = order;
          else delete next[screen];
          return { screenOrders: next };
        }),
      setLang: (lang) => set({ lang }),
      setActiveTrip: (activeTripId) => set({ activeTripId }),
      noteCurrencyUsed: (tripId, code) =>
        set((s) => ({
          lastCurrency: { ...s.lastCurrency, [tripId]: code },
          recentCurrencies: [code, ...s.recentCurrencies.filter((c) => c !== code)].slice(0, 6),
          currencyUsage: { ...s.currencyUsage, [code]: (s.currencyUsage[code] ?? 0) + 1 },
        })),
      cacheRates: (snap) =>
        set((s) => {
          // Keep the 30 most recent snapshots
          const next = { ...s.rates, [snap.requested_date]: snap };
          const keys = Object.keys(next).sort().reverse().slice(0, 30);
          return { rates: Object.fromEntries(keys.map((k) => [k, next[k]])) };
        }),
    }),
    {
      name: 'travelspend-prefs',
      storage: createJSONStorage(persistStorage),
      version: 1,
      // v1: rate snapshots carry a date and source per currency; drop older caches
      migrate: (state) => ({ ...(state as PrefsState), rates: {} }),
      // Older saved state has no screenOrders / expenseOrder yet
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<PrefsState>),
        screenOrders: (persisted as Partial<PrefsState>)?.screenOrders ?? {},
        homeViews: (persisted as Partial<PrefsState>)?.homeViews ?? {},
        expenseOrder: (persisted as Partial<PrefsState>)?.expenseOrder ?? {},
        lastPayment: (persisted as Partial<PrefsState>)?.lastPayment ?? {},
        lastPaymentAny: (persisted as Partial<PrefsState>)?.lastPaymentAny ?? null,
        lastPayer: (persisted as Partial<PrefsState>)?.lastPayer ?? {},
        lastSplit: (persisted as Partial<PrefsState>)?.lastSplit ?? {},
      }),
    },
  ),
);

/** Best cached snapshot for a date: exact match, else the latest one on or before it, else the latest overall. */
export function cachedRatesFor(rates: Record<string, RatesSnapshot>, date: string): RatesSnapshot | null {
  if (rates[date]) return rates[date];
  const keys = Object.keys(rates).sort();
  const before = keys.filter((k) => k <= date).pop();
  const key = before ?? keys.pop();
  return key ? rates[key] : null;
}

/** True while the guest demo is open. */
export function useIsDemo() {
  return usePrefs((s) => s.demo);
}
