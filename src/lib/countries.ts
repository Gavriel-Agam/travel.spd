// Country names from ISO codes, in the app's language (the browser / phone knows them).
export function countryName(code: string, lang: string): string {
  try {
    const names = new Intl.DisplayNames([lang === 'he' ? 'he' : 'en'], { type: 'region' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** A flag emoji from an ISO code (TH -> 🇹🇭). */
export function countryFlag(code: string): string {
  return code.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
}
