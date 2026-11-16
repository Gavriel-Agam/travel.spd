import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { takePendingJoin } from '@/lib/inviteLink';

/** Deep link travelspend://join/CODE (or the web link …/join/CODE) opens the join form with the code filled in. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  // Opened while signed in: the copy kept for after sign-in isn't needed
  useState(() => takePendingJoin());
  return <Redirect href={{ pathname: '/onboarding/join', params: { code: code ?? '' } }} />;
}
