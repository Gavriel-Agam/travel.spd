import type { TFunction } from 'i18next';

/** "ECB rate of 2026-10-30", "Market rate of ...", "Manual rate". */
export function rateSourceLabel(t: TFunction, source: string, date: string | null) {
  if (source === 'manual' || !date) return t('form.rateManual');
  if (source === 'ecb') return t('form.rateFrom', { date });
  if (source === 'par') return '';
  return t('form.rateFromMarket', { date });
}

export function rateSourceName(t: TFunction, source: string) {
  if (source === 'ecb') return t('details.sourceEcb');
  if (source === 'market') return t('details.sourceMarket');
  if (source === 'manual') return t('details.manual');
  return source;
}
