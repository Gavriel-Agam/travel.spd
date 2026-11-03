import { Stack } from 'expo-router';
import { useActiveTrip, useCurrencyList, useRates, useTripRealtime } from '@/api/queries';
import { useOutboxSync } from '@/hooks/useOutboxSync';
import { dayKey } from '@/lib/stats';
import { ErrorView, Loading, Screen } from '@/ui/primitives';
import { useColors } from '@/theme';

export default function AppLayout() {
  const c = useColors();
  const { trip, isLoading, error, refetch } = useActiveTrip();
  useCurrencyList();
  useTripRealtime(trip?.id);
  useOutboxSync();
  // Fetch today's rates on launch so conversion keeps working if the connection drops later
  useRates(dayKey(new Date(), trip?.timezone ?? 'UTC'));

  // Without a trip the stack shows onboarding: create one, or join with a code
  if (isLoading) return <Loading />;
  if (error && !trip)
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <ErrorView error={error} onRetry={refetch} />
      </Screen>
    );

  const hasTrip = !!trip;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Protected guard={hasTrip}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="expense/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="expense/[id]/index" />
        <Stack.Screen name="expense/[id]/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen name="categories" />
        <Stack.Screen name="settle" />
      </Stack.Protected>
      <Stack.Screen name="onboarding/index" />
      <Stack.Screen name="onboarding/create" />
      <Stack.Screen name="onboarding/join" />
      <Stack.Screen name="join/[code]" />
    </Stack>
  );
}
