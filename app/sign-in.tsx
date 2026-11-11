import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { fetchAuthProviders, sendPasswordReset, signInWithPassword, signInWithProvider, signUpWithPassword } from '@/lib/auth';
import { seedDemo } from '@/lib/demoSeed';
import { errorCode } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { usePrefs } from '@/store/prefs';
import { radius, space, useColors } from '@/theme';
import { AuthForm, submitAuthForm } from '@/ui/AuthForm';
import { Banner, Button, Divider, Field, Loading, Row, Screen, Segmented, Text } from '@/ui/primitives';
import { FacebookLogo, GoogleLogo } from '@/ui/BrandLogos';
import { FadeIn } from '@/ui/FadeIn';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Mode = 'signin' | 'signup';

/**
 * Sign in: Google and Facebook first (each only when it is turned on for the
 * project, so a button never leads to an error). Email + password and the
 * read-only demo sit behind "More sign-in options" (shown open when neither is
 * available). A phone still on the old no-login identity keeps its trip when
 * it signs in.
 */
export default function SignIn() {
  const { t } = useT();
  const c = useColors();
  const qc = useQueryClient();
  const { session } = useAuth();
  const setDemo = usePrefs((s) => s.setDemo);
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: fetchAuthProviders, staleTime: 10 * 60_000 });
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'google' | 'facebook' | 'reset'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const upgrading = !!session?.user.is_anonymous;
  const googleOn = Platform.OS === 'web' && !!providers.data?.google;
  const facebookOn = Platform.OS === 'web' && !!providers.data?.facebook;
  const socialOn = googleOn || facebookOn;
  const [more, setMore] = useState(false);
  // Until we know which sign-in methods are on, show neither layout (no flash of the email form)
  const checking = Platform.OS === 'web' && providers.isLoading;
  const showMore = !socialOn || more;

  const fail = (e: unknown) => setError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));

  async function submitEmail() {
    setError(null);
    setNotice(null);
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) return setError(t('auth.invalidEmail'));
    if (password.length < 8) return setError(t('auth.passwordTooShort'));
    setBusy('email');
    try {
      if (mode === 'signin') await signInWithPassword(value, password);
      else await signUpWithPassword(value, password);
      // The auth listener moves on to the app
    } catch (e) {
      const code = errorCode(e);
      if (mode === 'signup' && code === 'user_already_exists') {
        setMode('signin');
        setError(t('auth.accountExists'));
      } else if (code === 'unknown' && (e as { code?: string })?.code === 'confirmation_required') {
        setNotice(t('auth.confirmEmail'));
      } else fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function social(provider: 'google' | 'facebook') {
    setError(null);
    setBusy(provider);
    try {
      await signInWithProvider(provider); // leaves for Google / Facebook and comes back signed in
    } catch (e) {
      fail(e);
      setBusy(null);
    }
  }

  async function forgot() {
    setError(null);
    setNotice(null);
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) return setError(t('auth.resetNeedsEmail'));
    setBusy('reset');
    try {
      await sendPasswordReset(value);
      setNotice(t('auth.resetSent', { email: value }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function startDemo() {
    seedDemo(qc, t);
    setDemo(true);
  }

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: space.xl, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Image source={require('../assets/icon.png')} style={{ width: 84, height: 84, borderRadius: 22 }} accessibilityIgnoresInvertColors />
        <Text variant="title" center>
          SmartTrip
        </Text>
        <Text muted center>
          {t('auth.tagline')}
        </Text>
      </View>

      {upgrading ? <Banner text={t('auth.keepTrip')} color={c.primary} icon="shield-checkmark-outline" /> : null}

      {socialOn ? (
        <>
          <View style={{ gap: space.md }}>
            {googleOn ? (
              <SocialButton
                label={busy === 'google' ? t('common.loading') : t('auth.google')}
                logo={<GoogleLogo size={20} />}
                background="#FFFFFF"
                border="#DADCE0"
                text="#1F1F1F"
                disabled={!!busy}
                onPress={() => social('google')}
              />
            ) : null}
            {facebookOn ? (
              <SocialButton
                label={busy === 'facebook' ? t('common.loading') : t('auth.facebook')}
                logo={<FacebookLogo size={22} />}
                background="#1877F2"
                border="#1877F2"
                text="#FFFFFF"
                disabled={!!busy}
                onPress={() => social('facebook')}
              />
            ) : null}
          </View>
          {!more ? (
            // A quiet text link, not a button: email + password and the demo are secondary
            <Pressable accessibilityRole="button" onPress={() => setMore(true)} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: space.xs }}>
              <Text variant="label" muted style={{ textDecorationLine: 'underline' }}>
                {t('auth.moreOptions')}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {checking ? <Loading /> : null}

      {!checking && showMore ? (
        <FadeIn duration={socialOn ? 220 : 0} style={{ gap: space.xl }}>
          {socialOn ? (
          <Row gap={space.md}>
            <View style={{ flex: 1 }}>
              <Divider />
            </View>
            <Text variant="caption" muted>
              {t('auth.or')}
            </Text>
            <View style={{ flex: 1 }}>
              <Divider />
            </View>
          </Row>
          ) : null}

      <View style={{ gap: space.md }}>
        <Segmented<Mode>
          options={[
            { value: 'signin', label: t('auth.signInTab') },
            { value: 'signup', label: t('auth.signUpTab') },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
            setNotice(null);
          }}
        />
        <AuthForm onSubmit={submitEmail}>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={Platform.OS === 'web' ? 'username' : 'email'}
            textContentType="username"
          />
          <Field
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            hint={mode === 'signup' ? t('auth.passwordHint') : undefined}
            onSubmitEditing={() => submitAuthForm(submitEmail)}
          />
        </AuthForm>
        {error ? (
          <Text variant="label" color={c.danger} center>
            {error}
          </Text>
        ) : null}
        {notice ? <Banner text={notice} color={c.success} icon="mail-outline" /> : null}
        <Button
          title={mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
          onPress={() => submitAuthForm(submitEmail)}
          loading={busy === 'email'}
          disabled={!!busy && busy !== 'email'}
        />
        {mode === 'signin' ? (
          <Button title={t('auth.forgot')} variant="ghost" onPress={forgot} loading={busy === 'reset'} disabled={!!busy && busy !== 'reset'} />
        ) : null}
      </View>

      {!upgrading ? (
        <View style={{ gap: space.sm }}>
          <Divider />
          <Button title={t('auth.demo')} variant="secondary" icon="eye-outline" onPress={startDemo} disabled={!!busy} />
          <Text variant="caption" muted center>
            {t('auth.demoHint')}
          </Text>
        </View>
      ) : null}
        </FadeIn>
      ) : null}
    </Screen>
  );
}

/** A brand sign-in button (Google white, Facebook blue), logo before the words. */
function SocialButton({ label, logo, background, border, text, disabled, onPress }: {
  label: string;
  logo: ReactNode;
  background: string;
  border: string;
  text: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: radius.md,
        backgroundColor: background,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        borderWidth: 1,
        borderColor: border,
        opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      {logo}
      <Text variant="h2" color={text} style={{ fontSize: 16 }}>
        {label}
      </Text>
    </Pressable>
  );
}
