// Whether the app can reach the server, as React Query's onlineManager sees it.
//
// Browsers only say whether there is *a* network (navigator.onLine), not
// whether the server answers: on a plane, abroad or on a weak signal the
// phone may be "online" while every request fails or hangs. So:
// - at launch the browser's own flag is used (React Query assumes online);
// - any request that fails at network level marks the app offline at once,
//   so queries pause and show their saved data instead of retrying forever;
// - any request the server answers marks it online again at once;
// - while offline, a tiny request to the server every 10 seconds checks when
//   it is reachable again, then everything resumes (and queued changes sync).
import { onlineManager } from '@tanstack/react-query';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PROBE_EVERY = 10_000;
const PROBE_TIMEOUT = 5_000;

let started = false;
let probe: ReturnType<typeof setTimeout> | null = null;

/** True for errors that mean "no connection" rather than "the server said no". */
export function isNetworkError(e: unknown) {
  const err = e as { name?: string; message?: string } | null;
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError' || err.name === 'AuthRetryableFetchError') return true;
  return err.name === 'TypeError' && /fetch|network|load failed|timed out/i.test(err.message ?? '');
}

async function serverAnswers() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, cache: 'no-store', signal: ctrl.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function startProbing() {
  if (probe) return;
  const tick = async () => {
    probe = null;
    if (onlineManager.isOnline()) return;
    if (await serverAnswers()) onlineManager.setOnline(true);
    else probe = setTimeout(tick, PROBE_EVERY);
  };
  probe = setTimeout(tick, PROBE_EVERY);
}

/** A request failed at network level: go offline now (cached data, queued writes). */
export function noteNetworkFailure() {
  if (onlineManager.isOnline()) onlineManager.setOnline(false);
  startProbing();
}

/** The server answered a request: back online now (no need to wait for the next check). */
export function noteServerReached() {
  if (!onlineManager.isOnline()) onlineManager.setOnline(true);
}

/** Call once at start-up. */
export function startConnectivity() {
  if (started) return;
  started = true;
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) onlineManager.setOnline(false);
  // Whatever made us offline (browser event or failed request), keep checking until the server answers
  onlineManager.subscribe((online) => {
    if (!online) startProbing();
  });
  if (!onlineManager.isOnline()) startProbing();
}
