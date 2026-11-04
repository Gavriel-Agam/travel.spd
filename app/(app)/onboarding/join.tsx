import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/nav';
import { useState } from 'react';
import { useJoinTrip } from '@/api/queries';
import { useT } from '@/i18n';
import { errorCode } from '@/lib/supabase';
import { MEMBER_COLORS, useColors } from '@/theme';
import { Button, Field, IconButton, Row, Screen, Text } from '@/ui/primitives';

export default function JoinTrip() {
  const { t, lang } = useT();
  const c = useColors();
  const params = useLocalSearchParams<{ code?: string }>();
  const join = useJoinTrip();
  const [code, setCode] = useState((params.code ?? '').toUpperCase());
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setError(t('onboarding.nameRequired'));
    if (code.trim().length < 6) return setError(t('errors.invite_invalid'));
    setError(null);
    try {
      await join.mutateAsync({ code: code.trim(), memberName: name.trim(), color: MEMBER_COLORS[1] });
      router.replace('/');
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    }
  }

  return (
    <Screen>
      <Row>
        <IconButton name={lang === 'he' ? 'arrow-forward' : 'arrow-back'} onPress={() => goBack('/onboarding')} />
      </Row>
      <Text variant="title">{t('onboarding.join')}</Text>
      <Field label={t('onboarding.yourName')} value={name} onChangeText={setName} placeholder={t('onboarding.yourNamePlaceholder')} maxLength={40} />
      <Field
        label={t('onboarding.inviteCode')}
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ABCD2345"
        style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '700' }}
      />
      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Button title={t('onboarding.joinButton')} onPress={submit} loading={join.isPending} />
    </Screen>
  );
}
