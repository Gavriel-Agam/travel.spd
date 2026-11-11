// Per-device preferences and caches (not shared between partners).
import { persistStorage } from '@/lib/deviceStorage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RatesSnapshot } from '@/types/db';

type Lang = 'en' | 'he';

type PrefsState = {
  lang: Lang | null; // null = follow the device
  activeTripId: string | null;
  lastCurrency: Record<string, string>; // tripId -> code
  recentCurrencies: string[];
  currencyUsage: Record<string, number>;
  /** Latest rate snapshots by requested date, for offline conversion previews. */
  rates: Record<string, RatesSnapshot>;
  /** Order of the Home cards on this device (see lib/homeLayout). */
  homeOrder: string[] | null;
  /** The order changed on this device and has not reached the account yet (sent again on the next sync). */
  homeOrderDirty: boolean;
  /** Card order on other screens that can be rearranged (Statistics, Budget), on this device. */
  screenOrders: Record<string, string[]>;
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
      recentCurrencies: [],
      currencyUsage: {},
      rates: {},
      homeOrder: null,
      homeOrderDirty: false,
      screenOrders: {},
      feedbackPrompted: [],
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
      // Older saved state has no screenOrders yet
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<PrefsState>), screenOrders: (persisted as Partial<PrefsState>)?.screenOrders ?? {} }),
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
