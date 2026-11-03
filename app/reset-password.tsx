import { useState } from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { setNewPassword } from '@/lib/auth';
import { errorCode } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { space, useColors } from '@/theme';
import { AuthForm, submitAuthForm } from '@/ui/AuthForm';
import { Button, Field, Screen, Text } from '@/ui/primitives';

/** Opened from the "reset password" email: choose a new password, then continue to the app. */
export default function ResetPassword() {
  const { t } = useT();
  const c = useColors();
  const { clearRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (password.length < 8) return setError(t('auth.passwordTooShort'));
    setBusy(true);
    setError(null);
    try {
      await setNewPassword(password);
      clearRecovery();
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: space.lg, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
      <Text variant="title" center>
        {t('auth.newPasswordTitle')}
      </Text>
      <View style={{ gap: space.md }}>
        <AuthForm onSubmit={save}>
          <Field
            label={t('auth.newPassword')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            hint={t('auth.passwordHint')}
            autoFocus
            onSubmitEditing={() => submitAuthForm(save)}
          />
        </AuthForm>
        {error ? (
          <Text variant="label" color={c.danger} center>
            {error}
          </Text>
        ) : null}
        <Button title={t('common.save')} onPress={() => submitAuthForm(save)} loading={busy} />
      </View>
    </Screen>
  );
}
