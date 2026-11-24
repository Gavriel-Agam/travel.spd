import { describe, expect, it } from 'vitest';
import { isUserExpected, noteMissedUser, sentWithoutUser, setUserExpected, takeMissedUser } from '../sessionGuard';

const KEY = 'sb_publishable_test';
const API = 'https://x.supabase.co';

describe('sentWithoutUser', () => {
  it('flags a table read that carries only the public key', () => {
    expect(sentWithoutUser(`${API}/rest/v1/trips?select=*`, { Authorization: `Bearer ${KEY}`, apikey: KEY }, KEY)).toBe(true);
    expect(sentWithoutUser(`${API}/rest/v1/trips`, new Headers({ apikey: KEY }), KEY)).toBe(true);
  });

  it('flags functions and file requests too', () => {
    expect(sentWithoutUser(`${API}/functions/v1/voice-parse`, { Authorization: `Bearer ${KEY}` }, KEY)).toBe(true);
    expect(sentWithoutUser(`${API}/storage/v1/object/receipts/a.jpg`, { Authorization: `Bearer ${KEY}` }, KEY)).toBe(true);
  });

  it('lets requests with a user token through', () => {
    expect(sentWithoutUser(`${API}/rest/v1/trips`, new Headers({ Authorization: 'Bearer eyJuser', apikey: KEY }), KEY)).toBe(false);
  });

  it('never blocks the sign-in service itself (refreshing the token goes there)', () => {
    expect(sentWithoutUser(`${API}/auth/v1/token?grant_type=refresh_token`, { Authorization: `Bearer ${KEY}` }, KEY)).toBe(false);
  });
});

describe('missed requests', () => {
  it('reports a held-back request once, and forgets it on sign-out', () => {
    setUserExpected(true);
    expect(isUserExpected()).toBe(true);
    noteMissedUser();
    expect(takeMissedUser()).toBe(true);
    expect(takeMissedUser()).toBe(false);
    noteMissedUser();
    setUserExpected(false);
    expect(takeMissedUser()).toBe(false);
  });
});
