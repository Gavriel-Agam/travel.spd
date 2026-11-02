import { Redirect, useLocalSearchParams } from 'expo-router';

/** Deep link travelspend://join/CODE opens the join form with the code filled in. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/onboarding/join', params: { code: code ?? '' } }} />;
}
