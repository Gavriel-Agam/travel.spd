import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyDirection, deviceLang, initI18n } from '@/i18n';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { usePrefs } from '@/store/prefs';
import { Loading } from '@/ui/primitives';
import { useColors } from '@/theme';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 2 } },
});

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
  const { session, loading } = useAuth();
  const c = useColors();
  if (loading) return <Loading />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Protected guard={!isSupabaseConfigured}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={isSupabaseConfigured && !session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={isSupabaseConfigured && !!session}>
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
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="auto" />
            {hydrated ? <RootNavigator /> : <Loading />}
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
