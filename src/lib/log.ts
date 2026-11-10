// Error logging: every error is printed to the console and recorded in
// public.client_errors (write-only from the app), so problems on the phones
// can be diagnosed later from the server. Logging never throws.
import Constants from 'expo-constants';
import { onlineManager } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { errorCode, supabase } from './supabase';

const recent = new Map<string, number>();

function describe(error: unknown) {
  const e = error as { message?: string; code?: string; status?: number; details?: string; hint?: string; stack?: string; name?: string };
  return {
    message: (e?.message ?? String(error)).slice(0, 2000),
    details: {
      name: e?.name,
      pgCode: e?.code,
      status: e?.status,
      details: e?.details,
      hint: e?.hint,
      stack: e?.stack?.split('\n').slice(0, 8).join('\n'),
    },
  };
}

const EXPECTED = new Set([
  'demo_readonly',
  'invite_invalid',
  'invite_used',
  'invalid_credentials',
  'user_already_exists',
  'weak_password',
  'conflict',
  'over_email_send_rate_limit',
]);

/** Records an error. `context` says where it happened (screen, query key, action). */
export function logError(error: unknown, context: string, extra?: Record<string, unknown>) {
  try {
    const code = errorCode(error);
    // Expected outcomes the screen already explains (the demo, a wrong code or
    // password, a partner's concurrent edit): not app errors
    if (EXPECTED.has(code)) return;
    // No connection is a normal state here (offline mode shows saved data and
    // queues changes), not an app error; nothing could be sent anyway
    if (code === 'network' && !onlineManager.isOnline()) return;
    const { message, details } = describe(error);
    console.error(`[${context}] ${code}: ${message}`, error);

    // The same error repeating (retries, re-renders) is recorded once per 30s
    const key = `${context}|${message}`;
    const now = Date.now();
    if ((recent.get(key) ?? 0) > now - 30_000) return;
    recent.set(key, now);

    supabase
      .from('client_errors')
      .insert({
        code,
        message,
        context: context.slice(0, 200),
        details: { ...details, ...extra, platform: Platform.OS },
        url: typeof location !== 'undefined' ? location.href.slice(0, 500) : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
        app_version: Constants.expoConfig?.version ?? null,
      })
      .then(
        () => {},
        () => {},
      );
  } catch {
    // Logging must never break the app
  }
}

/** Uncaught errors and rejected promises in the browser. */
export function installGlobalErrorLogging() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.addEventListener('error', (e) => logError(e.error ?? e.message, 'window.error'));
  window.addEventListener('unhandledrejection', (e) => logError(e.reason, 'unhandledrejection'));
}
