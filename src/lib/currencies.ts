import bundled from '@/data/currencies.json';

export type Currency = {
  code: string;
  name_en: string;
  name_he: string;
  symbol: string;
  flag: string;
  minor_units: number;
};

export const HOME_CURRENCY = 'ILS';

/** Bundled copy of public.currencies, so the picker works offline on first launch. */
export const BUNDLED_CURRENCIES: Currency[] = bundled;

const byCode = new Map(BUNDLED_CURRENCIES.map((c) => [c.code, c]));

export function registerCurrencies(list: Currency[]) {
  for (const c of list) byCode.set(c.code, c);
}

export function getCurrency(code: string): Currency {
  return (
    byCode.get(code) ?? { code, name_en: code, name_he: code, symbol: code, flag: '', minor_units: 2 }
  );
}

export function allCurrencies(): Currency[] {
  return [...byCode.values()];
}

export function currencyName(c: Currency, lang: string) {
  return lang === 'he' ? c.name_he : c.name_en;
}

/** Search by code, English or Hebrew name, or symbol. Exact code/symbol hits rank first. */
export function searchCurrencies(list: Currency[], query: string): Currency[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const scored = list
    .map((c) => {
      const code = c.code.toLowerCase();
      let score = -1;
      if (code === q || c.symbol.toLowerCase() === q) score = 0;
      else if (code.startsWith(q)) score = 1;
      else if (c.name_en.toLowerCase().startsWith(q) || c.name_he.startsWith(q)) score = 2;
      else if (c.name_en.toLowerCase().includes(q) || c.name_he.includes(q) || c.symbol.toLowerCase().includes(q))
        score = 3;
      return { c, score };
    })
    .filter((x) => x.score >= 0);
  scored.sort((a, b) => a.score - b.score);
  return scored.map((x) => x.c);
}

/**
 * Picker sections: recently used first, then the most frequently used, then the rest.
 * `usage` maps code -> count, `recent` is most-recent-first.
 */
export function orderForPicker(list: Currency[], recent: string[], usage: Record<string, number>) {
  const recentSet = new Set(recent.slice(0, 4));
  const recentList = recent.slice(0, 4).map(getCurrency);
  const frequent = Object.entries(usage)
    .filter(([code, n]) => n > 0 && !recentSet.has(code))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([code]) => getCurrency(code));
  const used = new Set([...recentSet, ...frequent.map((c) => c.code)]);
  return { recent: recentList, frequent, all: list.filter((c) => !used.has(c.code)) };
}
