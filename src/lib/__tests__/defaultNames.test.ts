import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { displayMemberName, displayTripName } from '../defaultNames';

// Minimal stand-in for i18next's t with the Hebrew strings
const t = ((key: string, o?: { n?: string }) =>
  ({ 'mvp.tripName': 'הטיול שלנו', 'mvp.traveler': `מטייל/ת ${o?.n}` })[key] ?? key) as unknown as TFunction;

describe('placeholder names (QA bug #4)', () => {
  it('translates the server placeholders', () => {
    expect(displayTripName('Trip', t)).toBe('הטיול שלנו');
    expect(displayMemberName('Traveler 2', t)).toBe('מטייל/ת 2');
  });
  it('leaves names people chose alone', () => {
    expect(displayTripName('תאילנד 2026', t)).toBe('תאילנד 2026');
    expect(displayTripName('Trip to Laos', t)).toBe('Trip to Laos');
    expect(displayMemberName('Traveler 2 (me)', t)).toBe('Traveler 2 (me)');
    expect(displayMemberName('אשתי', t)).toBe('אשתי');
  });
});
