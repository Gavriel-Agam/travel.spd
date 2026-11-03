import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { usePrefs } from '@/store/prefs';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = url.startsWith('https://') && anonKey.length > 20;

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

// The guest demo never talks to the server: any request (read or write) is refused
const guardedFetch: typeof fetch = (input, init) =>
  usePrefs.getState().demo ? Promise.reject(new Error('demo_readonly')) : fetch(input, init);

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
  return known.find((k) => msg.includes(k)) ?? (/network|fetch/i.test(msg) ? 'network' : 'unknown');
}
