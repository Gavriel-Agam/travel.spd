import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { usePrefs } from '@/store/prefs';
import { isNetworkError, noteNetworkFailure, noteServerReached } from './connectivity';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// https everywhere, except the local QA stack on this computer (scripts/qa-local.mjs)
export const isSupabaseConfigured = /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/.test(url) && anonKey.length > 20;

// SecureStore values are limited to ~2KB and a session is larger, so the
// session is stored in numbered chunks in the device keychain.
const CHUNK = 1800;
const secureChunked = {
  async getItem(key: string) {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.some((p) => p == null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    const old = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    for (let i = n; i < old; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.setItemAsync(`${key}.n`, String(n));
  },
  async removeItem(key: string) {
    const n = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

const webStorage = {
  getItem: async (k: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(k)),
  setItem: async (k: string, v: string) => localStorage.setItem(k, v),
  removeItem: async (k: string) => localStorage.removeItem(k),
};

// Requests give up after a while instead of hanging on a weak signal (uploads get longer)
const TIMEOUT = 15_000;
const UPLOAD_TIMEOUT = 90_000;

// The guest demo never talks to the server: any request (read or write) is refused.
// A request that fails at network level (or times out) switches the app to
// offline mode right away: saved data shows and changes are queued. Any answer
// from the server switches it back.
const guardedFetch: typeof fetch = (input, init) => {
  if (usePrefs.getState().demo) return Promise.reject(new Error('demo_readonly'));
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const upload = /\/storage\/v1\/object/.test(href) && (init?.method ?? 'GET') !== 'GET';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), upload ? UPLOAD_TIMEOUT : TIMEOUT);
  // Keep the caller's own cancel signal working too
  init?.signal?.addEventListener('abort', () => ctrl.abort());
  return fetch(input, { ...init, signal: ctrl.signal })
    .then((res) => {
      noteServerReached();
      return res;
    })
    .catch((e) => {
      const timedOut = ctrl.signal.aborted && !init?.signal?.aborted;
      const err = timedOut ? new TypeError('Network request timed out') : e;
      if (timedOut || isNetworkError(err)) noteNetworkFailure();
      throw err;
    })
    .finally(() => clearTimeout(timer));
};

export const supabase = createClient(url || 'https://not-configured.supabase.co', anonKey || 'not-configured', {
  global: { fetch: guardedFetch },
  auth: {
    storage: Platform.OS === 'web' ? webStorage : secureChunked,
    autoRefreshToken: true,
    persistSession: true,
    // Google sign-in returns to the site with ?code=…; the client exchanges it
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});

/** Maps Postgres/RPC error messages to stable codes the UI can translate. */
export function errorCode(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const known = [
    'conflict',
    'not_found',
    'forbidden',
    'invite_invalid',
    'invite_used',
    'cannot_remove_owner',
    'invalid_split',
    'invalid_amount',
    'invalid_rate',
    'invalid_currency',
    'not_authenticated',
    'rates_unavailable',
    'session_expired',
    'transfer_invalid',
    'demo_readonly',
    'invalid_credentials',
    'user_already_exists',
    'weak_password',
    'signup_disabled',
    'provider_disabled',
    'over_email_send_rate_limit',
  ];
  // Supabase Auth reports these as codes rather than in the message
  const authCode = (e as { code?: string })?.code;
  if (authCode && known.includes(authCode)) return authCode;
  if (/provider is not enabled|Unsupported provider/i.test(msg)) return 'provider_disabled';
  return known.find((k) => msg.includes(k)) ?? (/network|fetch|timed out|abort|load failed/i.test(msg) || (e as { name?: string })?.name === 'AuthRetryableFetchError' ? 'network' : 'unknown');
}

/**
 * The session saved on this device, read without any network. Used when the
 * app opens offline: Supabase can't refresh an expired login token without a
 * connection and then reports "no session", which would show the sign-in
 * screen. The stored one is good enough to show cached data; it is refreshed
 * as soon as the server is reachable.
 */
export async function readStoredSession() {
  if (Platform.OS === 'web') return readStoredSessionNow();
  try {
    return parseSession(await secureChunked.getItem(sessionStorageKey()));
  } catch {
    return null;
  }
}

/** Web: the saved session, read synchronously (null on the phone app or when there is none). */
export function readStoredSessionNow() {
  if (Platform.OS !== 'web') return null;
  try {
    return parseSession(typeof localStorage === 'undefined' ? null : localStorage.getItem(sessionStorageKey()));
  } catch {
    return null;
  }
}

/** The key the login is saved under on this device. */
export function sessionStorageKey() {
  return (supabase.auth as unknown as { storageKey: string }).storageKey;
}

function parseSession(raw: string | null) {
  const s = raw ? JSON.parse(raw) : null;
  return s?.user?.id && s?.access_token ? (s as import('@supabase/supabase-js').Session) : null;
}
