// Countries: ISO 3166-1 alpha-2 codes, with names in the app's language from
// the browser / phone (Intl.DisplayNames), searchable in Hebrew and English.

const CODES = `AD AE AF AG AI AL AM AO AR AS AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BQ BR BS BT BW BY BZ
CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MP MQ MR
MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS
RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA
UG US UY UZ VA VC VE VG VI VN VU WS XK YE YT ZA ZM ZW`
  .split(/\s+/)
  .filter(Boolean);

export const COUNTRY_CODES: readonly string[] = CODES;

const namesCache = new Map<string, Intl.DisplayNames | null>();
function names(lang: string): Intl.DisplayNames | null {
  const key = lang === 'he' ? 'he' : 'en';
  if (!namesCache.has(key)) {
    try {
      namesCache.set(key, new Intl.DisplayNames([key], { type: 'region' }));
    } catch {
      namesCache.set(key, null);
    }
  }
  return namesCache.get(key) ?? null;
}

/** A country's name in the app's language (the code if the device doesn't know it). */
export function countryName(code: string, lang: string): string {
  try {
    return names(lang)?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** A flag emoji from an ISO code (TH -> 🇹🇭). */
export function countryFlag(code: string): string {
  return code.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇ]/g, '') // accents, Hebrew points
    .replace(/[״"'׳.\-\s]/g, '');

/**
 * Countries matching a search, by name in Hebrew or English or by code, sorted
 * by name in `lang`; names that start with the search come first.
 */
export function searchCountries(query: string, lang: string, codes: readonly string[] = COUNTRY_CODES): string[] {
  const q = fold(query);
  const byName = (a: string, b: string) => countryName(a, lang).localeCompare(countryName(b, lang), lang);
  if (!q) return [...codes].sort(byName);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const code of codes) {
    const he = fold(countryName(code, 'he'));
    const en = fold(countryName(code, 'en'));
    if (code.toLowerCase() === q || he.startsWith(q) || en.startsWith(q)) starts.push(code);
    else if (he.includes(q) || en.includes(q)) contains.push(code);
  }
  return [...starts.sort(byName), ...contains.sort(byName)];
}
