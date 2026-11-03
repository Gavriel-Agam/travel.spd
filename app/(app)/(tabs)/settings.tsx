import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, Pressable, Share, Switch, View } from 'react-native';
import { useInviteCode, useTrips, useUpdateMyMember, useUpdateTrip } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { applyDirection, initI18n, useT, type Lang } from '@/i18n';
import { currencyName, getCurrency } from '@/lib/currencies';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useOutbox } from '@/store/outbox';
import { usePrefs } from '@/store/prefs';
import { MEMBER_COLORS, radius, space, useColors } from '@/theme';
import { confirmDialog, showDialog } from '@/ui/Dialog';
import { CurrencyPicker } from '@/ui/CurrencyPicker';
import { DateField } from '@/ui/DateField';
import { Sheet } from '@/ui/Sheet';
import { Avatar, Button, Card, Divider, Field, ListRow, Row, Screen, Segmented, Text } from '@/ui/primitives';

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Settings() {
  const { t, lang } = useT();
  const c = useColors();
  const { trip, members, me } = useTripData();
  const trips = useTrips();
  const invite = useInviteCode(trip && !trip.shared ? trip.id : undefined);
  const updateTrip = useUpdateTrip(trip?.id ?? '');
  const updateMe = useUpdateMyMember(trip?.id ?? '');
  const setLang = usePrefs((s) => s.setLang);
  const setActiveTrip = usePrefs((s) => s.setActiveTrip);
  const queryClient = useQueryClient();
  const isAnonymous = useAuth().session?.user.is_anonymous ?? false;
  const [edit, setEdit] = useState<null | 'trip' | 'me'>(null);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasDates, setHasDates] = useState(false);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [currency, setCurrency] = useState('THB');
  const [pickCurrency, setPickCurrency] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!trip) return null;

  function changeLang(l: Lang) {
    setLang(l);
    initI18n(l);
    if (applyDirection(l)) showDialog(t('settings.language'), t('settings.languageRestart'));
  }

  async function shareInvite() {
    if (!invite.data) return;
    const message = t('settings.inviteShare', { code: invite.data });
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(message);
      setCopied(true);
    } else {
      await Share.share({ message });
    }
  }

  async function signOut() {
    const pending = useOutbox.getState().items.length;
    const body = pending > 0 ? t('settings.signOutPending', { count: pending }) : undefined;
    if (!(await confirmDialog(t('settings.signOutConfirm'), body, t('settings.signOut'), t('common.cancel'), true))) return;
    setActiveTrip(null);
    await supabase.auth.signOut();
    // Nothing from this account stays on the device
    useOutbox.setState({ items: [] });
    queryClient.clear();
  }

  return (
    <Screen>
      <Text variant="title">{t('settings.title')}</Text>

      {/* Trip */}
      <Card style={{ gap: 0 }}>
        <Text variant="label" muted>
          {t('settings.trip')}
        </Text>
        <ListRow
          icon={<Text style={{ fontSize: 20 }}>🧳</Text>}
          title={trip.name}
          subtitle={
            trip.start_date && trip.end_date
              ? t('stats.range', {
                  from: new Date(trip.start_date + 'T12:00:00Z').toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
                  to: new Date(trip.end_date + 'T12:00:00Z').toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
                })
              : undefined
          }
          chevron
          onPress={() => {
            setText(trip.name);
            setHasDates(!!trip.start_date);
            setStart(trip.start_date ? new Date(trip.start_date + 'T12:00:00') : new Date());
            setEnd(trip.end_date ? new Date(trip.end_date + 'T12:00:00') : new Date(Date.now() + 14 * 86_400_000));
            setCurrency(trip.default_currency);
            setFormError(null);
            setEdit('trip');
          }}
        />
        <Divider />
        <ListRow icon={<Text style={{ fontSize: 20 }}>🏷️</Text>} title={t('categories.manage')} chevron onPress={() => router.push('/categories')} />
      </Card>

      {/* Members + invite */}
      <Card>
        <Text variant="label" muted>
          {t('settings.members')}
        </Text>
        {members.map((m) => (
          <Row key={m.id} gap={space.md}>
            <Avatar name={m.display_name} color={m.color} />
            <Text style={{ flex: 1, fontWeight: '600' }}>
              {m.display_name}
              {m.id === me?.id ? ` (${t('common.you')})` : ''}
            </Text>
            {m.id === me?.id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.editMyName')}
                onPress={() => {
                  setText(m.display_name);
                  setEdit('me');
                }}
                hitSlop={8}
              >
                <Ionicons name="create-outline" size={20} color={c.primary} />
              </Pressable>
            ) : null}
          </Row>
        ))}
        {!trip.shared ? (
          <>
            <Divider />
            <Text variant="h2">{t('settings.invite')}</Text>
            <Text variant="caption" muted>
              {t('settings.inviteBody')}
            </Text>
            <Pressable
              onPress={async () => {
                if (!invite.data) return;
                await Clipboard.setStringAsync(invite.data);
                setCopied(true);
              }}
              style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.lg, alignItems: 'center' }}
            >
              <Text variant="title" style={{ letterSpacing: 6 }}>
                {invite.data ?? '········'}
              </Text>
              <Text variant="caption" muted>
                {copied ? t('common.copied') : t('common.copy')}
              </Text>
            </Pressable>
            <Button title={t('common.share')} icon="share-outline" variant="secondary" onPress={shareInvite} disabled={!invite.data} />
          </>
        ) : null}
      </Card>

      {/* Language */}
      <Card>
        <Text variant="label" muted>
          {t('settings.language')}
        </Text>
        <Segmented<Lang>
          options={[
            { value: 'he', label: 'עברית' },
            { value: 'en', label: 'English' },
          ]}
          value={lang}
          onChange={changeLang}
        />
      </Card>

      {/* Trips (not in the shared MVP trip: a separate trip would be invisible to the partner) */}
      {!trip.shared ? (
        <Card style={{ gap: 0 }}>
          <Text variant="label" muted>
            {t('settings.trips')}
          </Text>
          {(trips.data ?? []).map((tr) => (
            <ListRow
              key={tr.id}
              icon={<Ionicons name={tr.id === trip.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={c.primary} />}
              title={tr.name}
              onPress={() => setActiveTrip(tr.id)}
            />
          ))}
          <Divider />
          <ListRow icon={<Ionicons name="add" size={20} color={c.primary} />} title={t('settings.newTrip')} onPress={() => router.push('/onboarding/create')} />
          <ListRow icon={<Ionicons name="enter-outline" size={20} color={c.primary} />} title={t('settings.joinTrip')} onPress={() => router.push('/onboarding/join')} />
        </Card>
      ) : null}

      {/* Anonymous (MVP) devices would come back as a new traveller, so no sign-out */}
      {!isAnonymous ? <Button title={t('settings.signOut')} variant="danger" icon="log-out-outline" onPress={signOut} /> : null}
      <Text variant="caption" faint center>
        {t('settings.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}
      </Text>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit === 'trip' ? t('settings.tripDetails') : t('settings.myName')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Field
            label={edit === 'trip' ? t('settings.tripName') : undefined}
            value={text}
            onChangeText={setText}
            autoFocus
            maxLength={edit === 'trip' ? 80 : 40}
          />
          {edit === 'trip' ? (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label" muted>
                  {t('settings.tripDates')}
                </Text>
                <Switch value={hasDates} onValueChange={setHasDates} />
              </Row>
              {hasDates ? (
                <>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text muted>{t('onboarding.startDate')}</Text>
                    <DateField value={start} onChange={setStart} />
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text muted>{t('onboarding.endDate')}</Text>
                    <DateField value={end} onChange={setEnd} minimumDate={start} />
                  </Row>
                </>
              ) : null}
              <Pressable
                onPress={() => setPickCurrency(true)}
                style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md }}
              >
                <Text variant="label" muted style={{ flex: 1 }}>
                  {t('settings.tripCurrency')}
                </Text>
                <Text style={{ fontSize: 20 }}>{getCurrency(currency).flag}</Text>
                <Text style={{ fontWeight: '600' }}>
                  {currencyName(getCurrency(currency), lang)} · {currency}
                </Text>
              </Pressable>
              {formError ? <Text color={c.danger}>{formError}</Text> : null}
            </>
          ) : null}
          {edit === 'me' ? (
            <Row style={{ justifyContent: 'center' }} gap={space.md}>
              {MEMBER_COLORS.map((col) => (
                <Pressable key={col} onPress={() => me && updateMe.mutate({ memberId: me.id, color: col })}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: col,
                      borderWidth: 3,
                      borderColor: me?.color === col ? c.text : 'transparent',
                    }}
                  />
                </Pressable>
              ))}
            </Row>
          ) : null}
          <Button
            title={t('common.save')}
            loading={updateTrip.isPending || updateMe.isPending}
            disabled={!text.trim()}
            onPress={async () => {
              if (edit === 'trip') {
                const s = hasDates ? isoDate(start) : null;
                const e = hasDates ? isoDate(end) : null;
                if (s && e && e < s) return setFormError(t('settings.datesInvalid'));
                await updateTrip.mutateAsync({ name: text.trim(), start_date: s, end_date: e, default_currency: currency });
              }
              else if (me) await updateMe.mutateAsync({ memberId: me.id, display_name: text.trim() });
              setEdit(null);
            }}
          />
        </View>
      </Sheet>
      <CurrencyPicker visible={pickCurrency} value={currency} onSelect={setCurrency} onClose={() => setPickCurrency(false)} />
    </Screen>
  );
}
