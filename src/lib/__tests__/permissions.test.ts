import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPerm, notePerm, permState, storedPerm } from '../permissions';
import { currentPosition, resetLastFix } from '../location';

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('remembered permissions', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('navigator', {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remembers and forgets an answer', () => {
    expect(storedPerm('microphone')).toBe('unknown');
    notePerm('microphone', 'denied');
    expect(storedPerm('microphone')).toBe('denied');
    forgetPerm('microphone');
    expect(storedPerm('microphone')).toBe('unknown');
  });

  it('uses the remembered answer where the browser cannot tell', async () => {
    notePerm('geolocation', 'denied');
    expect(await permState('geolocation')).toBe('denied');
  });

  it("the browser's own answer wins; a no changed back to ask is forgotten", async () => {
    notePerm('microphone', 'denied');
    vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'prompt' }) } });
    expect(await permState('microphone')).toBe('prompt');
    expect(storedPerm('microphone')).toBe('unknown');
    vi.stubGlobal('navigator', { permissions: { query: async () => ({ state: 'granted' }) } });
    expect(await permState('microphone')).toBe('granted');
    expect(storedPerm('microphone')).toBe('granted');
  });
});

describe('position: ask once, reuse', () => {
  let calls = 0;
  const geo = (ok: boolean) => ({
    getCurrentPosition: (yes: (p: unknown) => void, no: (e: { code: number }) => void) => {
      calls++;
      if (ok) yes({ coords: { latitude: 13.75631, longitude: 100.50182 } });
      else no({ code: 1 });
    },
  });
  beforeEach(() => {
    calls = 0;
    resetLastFix();
    vi.stubGlobal('localStorage', fakeStorage());
    vi.stubGlobal('document', {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reuses a fix from the last 10 minutes without asking the phone again', async () => {
    vi.stubGlobal('navigator', { geolocation: geo(true) });
    expect(await currentPosition()).toEqual({ lat: 13.75631, lng: 100.50182 });
    expect(await currentPosition()).toEqual({ lat: 13.75631, lng: 100.50182 });
    expect(calls).toBe(1);
    expect(storedPerm('geolocation')).toBe('granted');
  });

  it('after a refusal it does not ask again', async () => {
    vi.stubGlobal('navigator', { geolocation: geo(false) });
    expect(await currentPosition()).toBeNull();
    expect(await currentPosition()).toBeNull();
    expect(calls).toBe(1);
    expect(storedPerm('geolocation')).toBe('denied');
  });
});
