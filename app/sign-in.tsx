import { useState } from 'react';
import { Image, View } from 'react-native';
import { useT } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';
import { Button, Field, Screen, Text } from '@/ui/primitives';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignIn() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) return setError(t('auth.invalidEmail'));
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({ email: value, options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) return setError(e.message);
    setEmail(value);
    setStep('code');
  }

  async function verify() {
    if (code.trim().length < 6) return setError(t('auth.invalidCode'));
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setBusy(false);
    // On success the auth listener swaps the navigator to the app
    if (e) setError(t('auth.invalidCode'));
  }

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: space.xl }}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Image source={require('../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: 22 }} accessibilityIgnoresInvertColors />
        <Text variant="title" center>
          TravelSpend Couple
        </Text>
        <Text muted center>
          {t('auth.tagline')}
        </Text>
      </View>

      {step === 'email' ? (
        <View style={{ gap: space.md }}>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            onSubmitEditing={sendCode}
            error={error}
          />
          <Button title={t('auth.sendCode')} onPress={sendCode} loading={busy} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <Text muted center>
            {t('auth.codeSent', { email })}
          </Text>
          <Field
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            onSubmitEditing={verify}
            style={{ fontSize: 28, letterSpacing: 10, textAlign: 'center', fontWeight: '700' }}
            error={error}
          />
          <Button title={t('auth.verify')} onPress={verify} loading={busy} />
          <Button title={t('auth.resend')} variant="ghost" onPress={sendCode} disabled={busy} />
          <Button
            title={t('auth.changeEmail')}
            variant="ghost"
            onPress={() => {
              setStep('email');
              setCode('');
              setError(null);
            }}
          />
        </View>
      )}
    </Screen>
  );
}
