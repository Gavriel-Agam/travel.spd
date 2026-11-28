import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useTrips } from '@/api/queries';
import { useT } from '@/i18n';
import { displayTripName } from '@/lib/defaultNames';
import { SHORTCUT_INSTALL_URL } from '@/lib/features';
import { goBack } from '@/lib/nav';
import { errorCode, supabase } from '@/lib/supabase';
import { useUserId } from '@/providers/AuthProvider';
import { radius, space, useColors } from '@/theme';
import { confirmDialog } from '@/ui/Dialog';
import { Banner, Button, Card, Chip, Divider, Field, IconButton, Row, Screen, Segmented, Text, Toggle } from '@/ui/primitives';
import { ApplePayMark } from '@/ui/ApplePayMark';
import { Topbar } from '@/ui/Topbar';

type TokenRow = { id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null };
type Settings = { default_trip_id: string | null; route_by_trip_dates: boolean; default_split_mode: 'equal' | 'personal'; notify_push: boolean };
const DEFAULTS: Settings = { default_trip_id: null, route_by_trip_dates: true, default_split_mode: 'equal', notify_push: true };

const ENDPOINT = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/ingest-smart-item`;

/** Settings › Automatic import (Shortcuts): personal keys, where payments go, and how to set up the iPhone. */
export default function Ingestion() {
  const c = useColors();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const userId = useUserId();
  const trips = useTrips();
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  const tokens = useQuery({
    queryKey: ['ingestion-tokens', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('ingestion_tokens').select('id, label, created_at, last_used_at, revoked_at').is('revoked_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data as TokenRow[];
    },
  });
  const settings = useQuery({
    queryKey: ['ingestion-settings', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('ingestion_settings').select('default_trip_id, route_by_trip_dates, default_split_mode, notify_push').maybeSingle();
      if (error) throw error;
      return { ...DEFAULTS, ...(data ?? {}) } as Settings;
    },
  });
  const s = settings.data ?? DEFAULTS;

  const save = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const next = { ...s, ...patch };
      const { error } = await supabase.from('ingestion_settings').upsert({ user_id: userId, ...next }, { onConflict: 'user_id' });
      if (error) throw error;
      return next;
    },
    onMutate: (patch) => qc.setQueryData(['ingestion-settings', userId], { ...s, ...patch }),
    onError: (e) => {
      setError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
      qc.invalidateQueries({ queryKey: ['ingestion-settings', userId] });
    },
  });

  /** One tap: a new key, copied, then the ready-made shortcut opens (it asks for the key once). */
  const install = async () => {
    setError(null);
    const { data, error } = await supabase.rpc('create_ingestion_token', { p_label: 'iPhone' });
    if (error) return setError(errorCode(error) === 'too_many_tokens' ? t('ingestion.tooMany') : t('errors.unknown'));
    const token = (data as { token: string }).token;
    // The shortcut asks for the whole header value (its import question)
    await Clipboard.setStringAsync(`Bearer ${token}`);
    setFresh(token);
    qc.invalidateQueries({ queryKey: ['ingestion-tokens', userId] });
    Linking.openURL(SHORTCUT_INSTALL_URL);
  };

  const create = async () => {
    setError(null);
    const { data, error } = await supabase.rpc('create_ingestion_token', { p_label: label.trim() || 'iPhone' });
    if (error) return setError(errorCode(error) === 'too_many_tokens' ? t('ingestion.tooMany') : t(`errors.${errorCode(error)}`, { defaultValue: t('errors.unknown') }));
    setFresh((data as { token: string }).token);
    setLabel('');
    qc.invalidateQueries({ queryKey: ['ingestion-tokens', userId] });
  };

  const revoke = async (row: TokenRow) => {
    if (!(await confirmDialog(t('ingestion.revokeConfirm', { name: row.label }), t('ingestion.revokeBody'), t('ingestion.revoke'), t('common.cancel'), true))) return;
    const { error } = await supabase.rpc('revoke_ingestion_token', { p_token_id: row.id });
    if (error) return setError(t('errors.unknown'));
    qc.invalidateQueries({ queryKey: ['ingestion-tokens', userId] });
  };

  const copy = async (what: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 1800);
  };

  const CopyBox = ({ id, label: l, value, secret }: { id: string; label: string; value: string; secret?: boolean }) => (
    <View style={{ gap: 4 }}>
      <Text variant="label" muted>
        {l}
      </Text>
      <Row gap={space.sm} style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: copied === id ? c.primary : 'transparent' }}>
        <Text variant="caption" style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', writingDirection: 'ltr', textAlign: 'left' }} selectable numberOfLines={secret ? 3 : 2}>
          {value}
        </Text>
        <IconButton name={copied === id ? 'checkmark' : 'copy-outline'} onPress={() => copy(id, value)} label={t('common.copy')} />
      </Row>
    </View>
  );

  const Step = ({ n, text }: { n: number; text: string }) => (
    <Row gap={space.sm} align="flex-start">
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" color={c.primary} style={{ fontWeight: '800' }}>
          {n}
        </Text>
      </View>
      <Text style={{ flex: 1, minWidth: 0 }}>{text}</Text>
    </Row>
  );

  const myTrips = trips.data ?? [];

  // Building the Apple Pay automation by hand: the address, three steps, the body
  const walletSteps = (
    <>
      <CopyBox id="url" label={t('ingestion.url')} value={ENDPOINT} />
      <Step n={1} text={t('ingestion.wallet1')} />
      <Step n={2} text={t('ingestion.wallet2')} />
      <Step n={3} text={t('ingestion.wallet3')} />
      <CopyBox id="wallet" label={t('ingestion.body')} value={'{"source":"shortcut_wallet","amount":"<Amount>","merchant":"<Merchant>","card_label":"<Card or Pass>","raw_text":"<Shortcut Input>"}'} />
    </>
  );

  return (
    <Screen>
      <Topbar title={t('ingestion.title')} titleIcon={<ApplePayMark />} onBack={() => goBack('/settings')} />
      <Text muted>{t('ingestion.intro')}</Text>
      {error ? <Banner text={error} color={c.danger} icon="alert-circle" /> : null}

      {/* Connect Apple Pay: one tap installs the ready-made shortcut */}
      <Card>
        <Row gap={space.sm}>
          <Ionicons name="logo-apple" size={22} color={c.text} />
          <Text variant="h2" style={{ flex: 1 }}>
            {t('ingestion.setup')}
          </Text>
        </Row>
        {SHORTCUT_INSTALL_URL ? (
          <>
            <Button title={t('ingestion.install')} icon="download-outline" onPress={install} />
            <Step n={1} text={t('ingestion.install1')} />
            <Step n={2} text={t('ingestion.install2')} />
            <Step n={3} text={t('ingestion.install3')} />
          </>
        ) : (
          // No ready-made shortcut yet: the steps to build it, right here
          walletSteps
        )}
        {fresh ? (
          <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.warning + '1A' }}>
            <Row gap={6}>
              <Ionicons name="key-outline" size={16} color={c.warning} />
              <Text style={{ fontWeight: '700', flex: 1 }}>{t('ingestion.showOnce')}</Text>
            </Row>
            <CopyBox id="token" label={t('ingestion.key')} value={fresh} secret />
            <Button title={t('ingestion.savedIt')} variant="secondary" onPress={() => setFresh(null)} />
          </View>
        ) : null}
      </Card>

      {/* Where payments go */}
      <Card>
        <Text variant="h2">{t('ingestion.routing')}</Text>
        <Row gap={space.md}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontWeight: '600' }}>{t('ingestion.byDates')}</Text>
            <Text variant="caption" muted>
              {t('ingestion.byDatesHint')}
            </Text>
          </View>
          <Toggle value={s.route_by_trip_dates} onValueChange={(v) => save.mutate({ route_by_trip_dates: v })} label={t('ingestion.byDates')} />
        </Row>
        <Text variant="label" muted>
          {t('ingestion.defaultTrip')}
        </Text>
        <Row gap={space.xs} style={{ flexWrap: 'wrap' }}>
          <Chip label={t('ingestion.noDefault')} selected={!s.default_trip_id} onPress={() => save.mutate({ default_trip_id: null })} />
          {myTrips.map((trip) => (
            <Chip key={trip.id} label={displayTripName(trip.name, t)} selected={s.default_trip_id === trip.id} onPress={() => save.mutate({ default_trip_id: trip.id })} />
          ))}
        </Row>
        <Text variant="label" muted>
          {t('ingestion.defaultSplit')}
        </Text>
        <Segmented
          options={[
            { value: 'equal', label: t('smartImport.splitEqual') },
            { value: 'personal', label: t('smartImport.splitPersonal') },
          ]}
          value={s.default_split_mode}
          onChange={(v) => save.mutate({ default_split_mode: v as Settings['default_split_mode'] })}
        />
        <Text variant="caption" muted>
          {t('ingestion.pendingNote')}
        </Text>
      </Card>

      {/* Keys: one per iPhone */}
      <Card>
        <Text variant="h2">{t('ingestion.keys')}</Text>
        {(tokens.data ?? []).map((row) => (
          <View key={row.id} style={{ gap: space.sm }}>
            <Row gap={space.md}>
              <Ionicons name="phone-portrait-outline" size={20} color={c.textMuted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '600' }} numberOfLines={1}>
                  {row.label}
                </Text>
                <Text variant="caption" muted numberOfLines={1}>
                  {row.last_used_at
                    ? t('ingestion.lastUsed', { when: new Date(row.last_used_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) })
                    : t('ingestion.neverUsed')}
                </Text>
              </View>
              <IconButton name="trash-outline" color={c.danger} onPress={() => revoke(row)} label={t('ingestion.revoke')} />
            </Row>
            <Divider />
          </View>
        ))}
        {!tokens.data?.length && !fresh ? <Text muted>{t('ingestion.noKeys')}</Text> : null}
        <Field label={t('ingestion.deviceName')} value={label} onChangeText={setLabel} placeholder="iPhone" maxLength={40} />
        <Button title={t('ingestion.create')} icon="add" variant="secondary" onPress={create} />
        <Text variant="caption" muted>
          {t('ingestion.headerNote')}
        </Text>
      </Card>

      {/* Manual setup: folded away, for building the shortcuts by hand */}
      <Card style={{ gap: manual ? space.md : 0 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: manual }}
          onPress={() => setManual((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 }}
        >
          <Ionicons name="construct-outline" size={20} color={c.textMuted} />
          <Text variant="h2" style={{ flex: 1 }}>
            {t('ingestion.manualTitle')}
          </Text>
          <Ionicons name={manual ? 'chevron-up' : 'chevron-down'} size={18} color={c.textMuted} />
        </Pressable>
        {manual ? (
          <>
            {SHORTCUT_INSTALL_URL ? (
              <>
                <Text style={{ fontWeight: '700' }}>💳 {t('ingestion.walletTitle')}</Text>
                {walletSteps}
                <Divider />
              </>
            ) : (
              <CopyBox id="url2" label={t('ingestion.url')} value={ENDPOINT} />
            )}
            <Text style={{ fontWeight: '700' }}>✉️ {t('ingestion.smsTitle')}</Text>
            <Step n={1} text={t('ingestion.sms1')} />
            <Step n={2} text={t('ingestion.sms2')} />
            <CopyBox id="sms" label={t('ingestion.body')} value={'{"source":"shortcut_notification","raw_text":"<Message>","title":"<Sender>"}'} />
            <Divider />
            <Text style={{ fontWeight: '700' }}>📤 {t('ingestion.shareTitle')}</Text>
            <Step n={1} text={t('ingestion.share1')} />
            <Step n={2} text={t('ingestion.share2')} />
            <CopyBox id="share" label={t('ingestion.body')} value={'{"source":"shortcut_share","text":"<Shortcut Input>","image_base64":"<Base64 Encoded>","mime_type":"image/jpeg"}'} />
            <Divider />
            <Text style={{ fontWeight: '700' }}>📡 {t('ingestion.offlineTitle')}</Text>
            <Text muted>{t('ingestion.offlineBody')}</Text>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
