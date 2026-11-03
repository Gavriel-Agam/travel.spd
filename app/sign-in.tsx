import { useState } from 'react';
import { Image, View } from 'react-native';
import { useT } from '@/i18n';
import { errorCode, supabase } from '@/lib/supabase';
import { space, useColors } from '@/theme';
import { Button, Screen, Text } from '@/ui/primitives';

/**
 * MVP start screen: no email, code or password. "Start" signs this device in
 * anonymously; the app then joins the shared trip automatically.
 */
export default function Start() {
  const { t } = useT();
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInAnonymously();
    setBusy(false);
    // On success the auth listener swaps the navigator to the app
    if (e) setError(t(`errors.${errorCode(e)}`));
  }

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: space.xxl }}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <Image source={require('../assets/icon.png')} style={{ width: 96, height: 96, borderRadius: 26 }} accessibilityIgnoresInvertColors />
        <Text variant="title" center>
          TravelSpend Couple
        </Text>
        <Text muted center>
          {t('auth.tagline')}
        </Text>
      </View>
      <View style={{ gap: space.md }}>
        <Button title={t('auth.start')} onPress={start} loading={busy} icon="arrow-forward" />
        {error ? (
          <Text variant="label" color={c.danger} center>
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
