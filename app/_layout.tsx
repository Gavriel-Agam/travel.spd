import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyDirection, deviceLang, initI18n } from '@/i18n';
import { installGlobalErrorLogging, logError } from '@/lib/log';
import { promptSignUp } from '@/lib/demoPrompt';
import { errorCode, isSupabaseConfigured } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { useIsDemo, usePrefs } from '@/store/prefs';
import { seedDemo } from '@/lib/demoSeed';
import i18n from '@/i18n';
import { DialogHost } from '@/ui/Dialog';
import { Loading } from '@/ui/primitives';
import { useColors } from '@/theme';

const WEEK = 7 * 24 * 3600_000;

const queryClient: QueryClient = new QueryClient({
  // Kept for a week so the last-loaded trip still shows when the app opens offline
  defaultOptions: { queries: { staleTime: 30_000, retry: 2, gcTime: WEEK } },
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

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'travelspend-cache', throttleTime: 2000 });

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
  if (loading || transferring) return <Loading />;
  // An anonymous identity (from the no-login MVP) must sign in; its trips move to the account
  const signedIn = !!session && !session.user.is_anonymous;
  return (
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
  );
}

export default function RootLayout() {
  const hydrated = usePrefsHydrated();
  const lang = usePrefs((s) => s.lang) ?? deviceLang();
  if (hydrated) {
    initI18n(lang);
    applyDirection(lang);
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: WEEK, buster: 'v1' }}
          // Restoring the saved cache must not replace the demo trip
          onSuccess={() => usePrefs.getState().demo && seedDemo(queryClient, i18n.t)}
        >
          <AuthProvider>
            <StatusBar style="auto" />
            {hydrated ? <RootNavigator /> : <Loading />}
            <DialogHost />
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
