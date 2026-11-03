import type { TFunction } from 'i18next';

// The shared MVP trip and its travellers are created on the server with
// neutral English placeholders ("Trip", "Traveler 2"). Until someone renames
// them, show them in the interface language (QA bug #4).

export function displayTripName(name: string, t: TFunction) {
  return name === 'Trip' ? t('mvp.tripName') : name;
}

export function displayMemberName(name: string, t: TFunction) {
  const m = /^Traveler (\d+)$/.exec(name);
  return m ? t('mvp.traveler', { n: m[1] }) : name;
}
