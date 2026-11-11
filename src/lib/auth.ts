// Sign-in methods: email + password, Google and Facebook (OAuth, web). A phone that was
// using the no-login MVP has an anonymous identity; before it signs in we take
// a one-time transfer token for that identity, and after sign-in we hand it
// back so its trips and expenses move to the real account.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logError } from './log';
import { supabase } from './supabase';

const TRANSFER_KEY = 'travelspend-transfer-token';

/** Where Google, Facebook and password-reset links return to (the site itself). */
export function siteUrl() {
  if (Platform.OS === 'web' && typeof location !== 'undefined') return `${location.origin}/travel.spd/`;
  return 'travelspend://';
}

async function beginTransferIfAnonymous() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.is_anonymous) return;
  const { data: token, error } = await supabase.rpc('start_account_transfer');
  if (error) {
    logError(error, 'auth:start_transfer');
    return;
  }
  await AsyncStorage.setItem(TRANSFER_KEY, token as string);
}

/** Whether an old anonymous identity is waiting to be moved to the account (no network). */
export async function hasPendingTransfer() {
  return !!(await AsyncStorage.getItem(TRANSFER_KEY));
}

/** Runs after any sign-in; moves the old anonymous identity's data if a token is waiting. */
export async function finishPendingTransfer(): Promise<number> {
  const token = await AsyncStorage.getItem(TRANSFER_KEY);
  if (!token) return 0;
  const { data, error } = await supabase.rpc('finish_account_transfer', { p_token: token });
  await AsyncStorage.removeItem(TRANSFER_KEY);
  if (error) {
    logError(error, 'auth:finish_transfer');
    return 0;
  }
  return (data as number) ?? 0;
}

export async function signInWithPassword(email: string, password: string) {
  await beginTransferIfAnonymous();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithPassword(email: string, password: string) {
  await beginTransferIfAnonymous();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: siteUrl() } });
  if (error) throw error;
  // With email confirmation off, sign-up returns a session straight away
  if (!data.session) throw Object.assign(new Error('confirmation_required'), { code: 'confirmation_required' });
}

/** Leaves the site for Google or Facebook and comes back signed in (web). */
export async function signInWithProvider(provider: 'google' | 'facebook') {
  await beginTransferIfAnonymous();
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: siteUrl() } });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
  if (error) throw error;
}

export async function setNewPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Which sign-in methods the project has turned on (so a button never leads to an error). */
export async function fetchAuthProviders(): Promise<{ google: boolean; facebook: boolean; email: boolean }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key ?? '' } });
  const body = (await res.json()) as { external?: Record<string, boolean> };
  return { google: !!body.external?.google, facebook: !!body.external?.facebook, email: !!body.external?.email };
}
