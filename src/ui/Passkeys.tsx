// Passkeys (Face ID, fingerprint, device PIN): a one-time offer after sign-in
// and a Settings card to add or remove them. Shown only where the browser
// supports passkeys and the project has them turned on (Supabase beta).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { addPasskey, fetchAuthProviders, listPasskeys, passkeySupported, removePasskey } from '@/lib/auth';
import { errorCode } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useIsDemo, usePrefs } from '@/store/prefs';
import { space, useColors } from '@/theme';
import { confirmDialog } from '@/ui/Dialog';
import { Button, Card, Row, Text } from '@/ui/primitives';

/** The user cancelled the Face ID / fingerprint prompt (not an error worth showing). */
function isCancel(e: unknown) {
  const name = (e as { name?: string })?.name;
  const msg = String((e as { message?: string })?.message ?? '');
  return name === 'NotAllowedError' || name === 'AbortError' || /not allowed|cancel|abort/i.test(msg);
}

/** Passkeys can be used here: signed-in real account, supported browser, turned on in the project. */
export function usePasskeysAvailable() {
  const { session } = useAuth();
  const demo = useIsDemo();
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: fetchAuthProviders, staleTime: 10 * 60_000 });
  return !!session && !session.user.is_anonymous && !demo && passkeySupported() && !!providers.data?.passkey;
}

function usePasskeyList(enabled: boolean) {
  const { session } = useAuth();
  return useQuery({ queryKey: ['passkeys', session?.user.id], queryFn: listPasskeys, enabled, staleTime: 60_000 });
}

function useAddPasskey() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: addPasskey, onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }) });
}

/** Home: offered once per account on this device, only while it has no passkey. */
export function PasskeyOffer() {
  const { t } = useT();
  const c = useColors();
  const { session } = useAuth();
  const userId = session?.user.id;
  const available = usePasskeysAvailable();
  const offered = usePrefs((s) => !!userId && s.passkeyOffered.includes(userId));
  const list = usePasskeyList(available && !offered);
  const add = useAddPasskey();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!userId || !available || (offered && !done) || !list.data || (list.data.length > 0 && !done)) return null;
  const close = () => usePrefs.getState().markPasskeyOffered(userId);

  if (done) {
    return (
      <Card>
        <Text variant="label" color={c.text}>
          {t('passkeys.added')}
        </Text>
        <Button title={t('common.done')} variant="ghost" onPress={() => setDone(false)} />
      </Card>
    );
  }

  return (
    <Card>
      <Text variant="h2">{t('passkeys.offerTitle')}</Text>
      <Text muted>{t('passkeys.offerBody')}</Text>
      {error ? <Text color={c.danger}>{error}</Text> : null}
      <Row style={{ gap: space.sm }}>
        <Button
          title={t('passkeys.offerYes')}
          icon="finger-print"
          loading={add.isPending}
          style={{ flex: 1 }}
          onPress={() => {
            setError(null);
            add.mutate(undefined, {
              onSuccess: () => {
                close();
                setDone(true);
              },
              onError: (e) => setError(isCancel(e) ? t('passkeys.cancelled') : t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') })),
            });
          }}
        />
        <Button title={t('passkeys.offerNo')} variant="ghost" style={{ flex: 1 }} onPress={close} />
      </Row>
    </Card>
  );
}

/** Settings: add a passkey on this device, see and remove saved ones. */
export function PasskeysCard() {
  const { t, lang } = useT();
  const c = useColors();
  const qc = useQueryClient();
  const available = usePasskeysAvailable();
  const list = usePasskeyList(available);
  const add = useAddPasskey();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  if (!available) return null;

  const fail = (e: unknown) =>
    setMsg({ text: isCancel(e) ? t('passkeys.cancelled') : t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }), error: !isCancel(e) });

  async function remove(id: string) {
    const yes = await confirmDialog(t('passkeys.remove'), t('passkeys.removeConfirm'), t('passkeys.remove'), t('common.cancel'), true);
    if (!yes) return;
    try {
      await removePasskey(id);
      qc.invalidateQueries({ queryKey: ['passkeys'] });
    } catch (e) {
      fail(e);
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Card>
      <Text variant="label" muted>
        {t('passkeys.title')}
      </Text>
      <Text muted>{t('passkeys.about')}</Text>
      {(list.data ?? []).map((p) => (
        <Row key={p.id} style={{ gap: space.sm, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text>{p.friendly_name || t('passkeys.device')}</Text>
            <Text variant="caption" faint>
              {p.last_used_at ? t('passkeys.lastUsed', { date: fmt(p.last_used_at) }) : fmt(p.created_at)}
            </Text>
          </View>
          <Button title={t('passkeys.remove')} variant="danger" onPress={() => remove(p.id)} />
        </Row>
      ))}
      {list.data && list.data.length === 0 ? (
        <Text variant="caption" faint>
          {t('passkeys.none')}
        </Text>
      ) : null}
      {msg ? <Text color={msg.error ? c.danger : c.text}>{msg.text}</Text> : null}
      <Button
        title={t('passkeys.add')}
        icon="finger-print"
        variant="secondary"
        loading={add.isPending}
        onPress={() => {
          setMsg(null);
          add.mutate(undefined, { onSuccess: () => setMsg({ text: t('passkeys.added') }), onError: fail });
        }}
      />
    </Card>
  );
}
