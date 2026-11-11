import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, hydrate, MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClientSubscribe, PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyDirection, deviceLang, initI18n } from '@/i18n';
import { installGlobalErrorLogging, logError } from '@/lib/log';
import { startConnectivity } from '@/lib/connectivity';
import { startAppUpdateChecks } from '@/lib/appUpdate';
import { webStorage } from '@/lib/deviceStorage';
import { dropLaunchSnapshotStyles, startLaunchSnapshots } from '@/lib/launchSnapshot';
import { promptSignUp } from '@/lib/demoPrompt';
import { errorCode, isSupabaseConfigured } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { useIsDemo, usePrefs } from '@/store/prefs';
import { seedDemo } from '@/lib/demoSeed';
import i18n from '@/i18n';
import { DialogHost } from '@/ui/Dialog';
import { GestureRoot } from '@/ui/GestureRoot';
import { ConfettiHost } from '@/ui/Confetti';
import { Loading } from '@/ui/primitives';
import { useColors } from '@/theme';
import { themes } from '@/palette';

// Saved data is kept a month: long trips can go days without a usable signal.
// In memory, unused queries live 24 days: React Query's timer can't go past
// ~24.8 days (a longer value overflows and drops every query at once).
const DAY = 24 * 3600_000;
const MONTH = 30 * DAY;
const MEMORY = 24 * DAY;

const queryClient: QueryClient = new QueryClient({
  // Kept so the last-loaded trip still shows when the app opens offline
  defaultOptions: { queries: { staleTime: 30_000, retry: 2, gcTime: MEMORY } },
  // Every failed load or save is logged (console + public.client_errors)
  queryCache: new QueryCache({ onError: (e, query) => logError(e, `query:${JSON.stringify(query.queryKey)}`) }),
  mutationCache: new MutationCache({
    onError: (e, _vars, _ctx, mutation) => {
      // A save attempted in the guest demo: invite the guest to sign up instead
      if (errorCode(e) === 'demo_readonly') {
        promptSignUp(queryClient);
        return;
      }
      logError(e, `mutation:${mutation.options.mutationKey ? JSON.stringify(mutation.options.mutationKey) : 'unnamed'}`);
    },
  }),
});

installGlobalErrorLogging();
// Offline detection: the browser's flag at launch, failed requests, and a probe until the server answers
startConnectivity();
// Web: look for a newer version when the app comes back to the foreground
startAppUpdateChecks();
// Web: keep a copy of Home for the next launch when the app goes to the background
startLaunchSnapshots();

const CACHE_KEY = 'travelspend-cache';
const BUSTER = 'v1';
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: CACHE_KEY, throttleTime: 2000 });

/**
 * Web: put the saved copy of the data back before the first render, so Home
 * draws the trip at once (with or without signal) instead of first drawing a
 * placeholder while it is read. Same checks as React Query's own restore: a
 * copy older than a month or from an older format is dropped. Returns false on
 * the phone app, which restores through PersistQueryClientProvider.
 */
function restoreSavedDataNow() {
  const ls = webStorage();
  if (!ls) return false;
  try {
    const raw = ls.getItem(CACHE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved?.timestamp && Date.now() - saved.timestamp <= MONTH && saved.buster === BUSTER) hydrate(queryClient, saved.clientState);
    else if (raw) ls.removeItem(CACHE_KEY);
  } catch {
    try {
      ls.removeItem(CACHE_KEY);
    } catch {
      // storage blocked: start empty
    }
  }
  return true;
}
const restoredNow = restoreSavedDataNow();

/** Web: keeps saving the data (it was already restored above). */
function SaveDataCache() {
  useEffect(() => {
    // The demo trip is never sent anywhere; put it back after a reload
    if (usePrefs.getState().demo) seedDemo(queryClient, i18n.t);
    return persistQueryClientSubscribe({ queryClient, persister, buster: BUSTER });
  }, []);
  return null;
}

// Refetch when the app returns to the foreground
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
}

function usePrefsHydrated() {
  const [hydrated, setHydrated] = useState(usePrefs.persist.hasHydrated());
  useEffect(() => usePrefs.persist.onFinishHydration(() => setHydrated(true)), []);
  return hydrated;
}

function RootNavigator() {
  const { session, loading, recovery, transferring } = useAuth();
  const demo = useIsDemo();
  const c = useColors();
  // Navigation's own containers in the app's colours (its default is light grey,
  // which flashed when a tab or screen was opened for the first time)
  const navTheme = useMemo(() => {
    const base = c.bg === themes.dark.bg ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: c.bg, card: c.card, text: c.text, border: c.border, primary: c.primary } };
  }, [c]);
  if (loading || transferring) return <Loading />;
  // An anonymous identity (from the no-login MVP) must sign in; its trips move to the account
  const signedIn = !!session && !session.user.is_anonymous;
  return (
    <ThemeProvider value={navTheme}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Protected guard={!isSupabaseConfigured}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={isSupabaseConfigured && recovery && signedIn}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={isSupabaseConfigured && !signedIn && !demo}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={isSupabaseConfigured && (signedIn || demo) && !recovery}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const hydrated = usePrefsHydrated();
  // The live app has replaced the saved copy of Home shown at launch
  useEffect(() => dropLaunchSnapshotStyles(), []);
  const lang = usePrefs((s) => s.lang) ?? deviceLang();
  if (hydrated) {
    initI18n(lang);
    applyDirection(lang);
  }

  const app = (
    <AuthProvider>
      <StatusBar style="auto" />
      {hydrated ? <RootNavigator /> : <Loading />}
      <DialogHost />
      <ConfettiHost />
    </AuthProvider>
  );

  return (
    <GestureRoot>
      <SafeAreaProvider>
        {restoredNow ? (
          <QueryClientProvider client={queryClient}>
            <SaveDataCache />
            {app}
          </QueryClientProvider>
        ) : (
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, maxAge: MONTH, buster: BUSTER }}
            // Restoring the saved cache must not replace the demo trip
            onSuccess={() => usePrefs.getState().demo && seedDemo(queryClient, i18n.t)}
          >
            {app}
          </PersistQueryClientProvider>
        )}
      </SafeAreaProvider>
    </GestureRoot>
  );
}

/**
 * Shown instead of a blank screen if anything crashes while drawing. The crash
 * is logged; "Try again" re-renders the app. Bilingual because the crash may
 * happen before the language is set up.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => logError(error, 'render-crash'), [error]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: '#0E1020' }}>
      <Text style={{ fontSize: 44 }}>⚠️</Text>
      <Text style={{ color: '#F2F3F8', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>משהו השתבש · Something went wrong</Text>
      <Text style={{ color: '#A0A4BA', fontSize: 12, textAlign: 'center' }} selectable>
        {error.message}
      </Text>
      <Pressable onPress={retry} style={{ backgroundColor: '#3366FF', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14, marginTop: 8 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>נסו שוב · Try again</Text>
      </Pressable>
    </View>
  );
}
