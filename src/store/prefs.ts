// Per-device preferences and caches (not shared between partners).
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // v1: rate snapshots carry a date and source per currency; drop older caches
      migrate: (state) => ({ ...(state as PrefsState), rates: {} }),
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
