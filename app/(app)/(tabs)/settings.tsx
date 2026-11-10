import { Ionicons } from '@expo/vector-icons';
import { SyncStatus } from '@/ui/SyncStatus';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Image, Platform, Pressable, Share, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { removeMemberPhoto, removeTripCover, uploadMemberPhoto, uploadTripCover, useInviteCode, useRemoveMember, useTrips, useUpdateMyMember, useUpdateTrip } from '@/api/queries';
import { errorCode } from '@/lib/supabase';
import { TRIP_THEMES, type TripTheme } from '@/palette';
import { useTripLook } from '@/store/tripLook';
import { useTripData } from '@/hooks/useTripData';
import { applyDirection, initI18n, useT, type Lang } from '@/i18n';
import { currencyName, getCurrency } from '@/lib/currencies';
import { useAuth, useUserId } from '@/providers/AuthProvider';
import { useExitDemo } from '@/hooks/useExitDemo';
import { useSignOut } from '@/hooks/useSignOut';
import { blockedInDemo } from '@/lib/demoPrompt';
import { seedDemo } from '@/lib/demoSeed';
import i18n from '@/i18n';
import { useIsDemo, usePrefs } from '@/store/prefs';
import { MEMBER_COLORS, radius, space, useColors } from '@/theme';
import { confirmDialog, showDialog } from '@/ui/Dialog';
import { CopyCode } from '@/ui/CopyCode';
import { CurrencyPicker } from '@/ui/CurrencyPicker';
import { DateField } from '@/ui/DateField';
import { Sheet } from '@/ui/Sheet';
import { Avatar, Button, Card, Divider, Field, ListRow, Row, Screen, Segmented, Text, Toggle } from '@/ui/primitives';

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
  const removeMember = useRemoveMember(trip?.id ?? '');
  const userId = useUserId();
  const setLang = usePrefs((s) => s.setLang);
  const setActiveTrip = usePrefs((s) => s.setActiveTrip);
  const queryClient = useQueryClient();
  const isAnonymous = useAuth().session?.user.is_anonymous ?? false;
  const demo = useIsDemo();
  const exitDemo = useExitDemo();
  const signOut = useSignOut();
  const isCreator = !!trip && !trip.shared && !demo && trip.created_by === userId;
  const [edit, setEdit] = useState<null | 'trip' | 'me'>(null);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasDates, setHasDates] = useState(false);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [currency, setCurrency] = useState('THB');
  const [themeColor, setThemeColor] = useState<TripTheme>('blue');
  const [coverBusy, setCoverBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const coverUrl = useTripLook((s) => s.coverUrl);
  const [pickCurrency, setPickCurrency] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!trip) return null;

  async function pickCover() {
    if (!trip || blockedInDemo(queryClient)) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    setCoverBusy(true);
    setFormError(null);
    try {
      await uploadTripCover(trip.id, res.assets[0].uri, trip.cover_path);
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch (e) {
      setFormError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    } finally {
      setCoverBusy(false);
    }
  }

  async function pickMemberPhoto() {
    if (!trip || !me || blockedInDemo(queryClient)) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    setFormError(null);
    try {
      await uploadMemberPhoto(trip.id, me.id, res.assets[0].uri, me.photo_path);
      await queryClient.invalidateQueries({ queryKey: ['members', trip.id] });
    } catch (e) {
      setFormError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function dropMemberPhoto() {
    if (!trip || !me?.photo_path || blockedInDemo(queryClient)) return;
    setPhotoBusy(true);
    try {
      await removeMemberPhoto(me.id, me.photo_path);
      await queryClient.invalidateQueries({ queryKey: ['members', trip.id] });
    } catch (e) {
      setFormError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function dropCover() {
    if (!trip?.cover_path || blockedInDemo(queryClient)) return;
    setCoverBusy(true);
    try {
      await removeTripCover(trip.id, trip.cover_path);
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch (e) {
      setFormError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    } finally {
      setCoverBusy(false);
    }
  }

  function changeLang(l: Lang) {
    setLang(l);
    initI18n(l);
    // The sample trip's names are written in the chosen language
    if (demo) seedDemo(queryClient, i18n.t);
    if (applyDirection(l)) showDialog(t('settings.language'), t('settings.languageRestart'));
  }

  async function removePartner(memberId: string, name: string) {
    if (blockedInDemo(queryClient)) return;
    const yes = await confirmDialog(
      t('settings.removeMemberTitle', { name }),
      t('settings.removeMemberBody', { name }),
      t('settings.removeMemberConfirm'),
      t('common.cancel'),
      true,
    );
    if (!yes) return;
    try {
      await removeMember.mutateAsync(memberId);
    } catch (e) {
      showDialog(t('errors.title'), t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    }
  }

  async function shareInvite() {
    if (!invite.data) return;
    const message = t('settings.inviteShare', { code: invite.data });
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      await Share.share({ message });
    }
  }

  return (
    <Screen>
      <Text variant="title">{t('settings.title')}</Text>
      <SyncStatus tripId={trip.id} />

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
          <ListRow icon={<Ionicons name="add" size={20} color={c.primary} />} title={t('settings.newTrip')} onPress={() => !blockedInDemo(queryClient) && router.push('/onboarding/create')} />
          <ListRow icon={<Ionicons name="enter-outline" size={20} color={c.primary} />} title={t('settings.joinTrip')} onPress={() => !blockedInDemo(queryClient) && router.push('/onboarding/join')} />
        </Card>
      ) : null}

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
            setThemeColor((trip.theme_color as TripTheme | null) ?? 'blue');
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
            <Avatar name={m.display_name} color={m.color} photoPath={m.photo_path} size={40} />
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
            ) : isCreator && m.user_id !== trip.created_by ? (
              // Trip creator only: remove a partner (the server checks this too)
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('settings.removeMember', { name: m.display_name })}
                onPress={() => removePartner(m.id, m.display_name)}
                disabled={removeMember.isPending}
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color={c.danger} />
              </Pressable>
            ) : null}
          </Row>
        ))}
        {!trip.shared && !demo ? (
          <>
            <Divider />
            <Text variant="h2">{t('settings.invite')}</Text>
            <Text variant="caption" muted>
              {t('settings.inviteBody')}
            </Text>
            <CopyCode code={invite.data} />
            {/* On the web "Share" copies the invite message: the button says so for a moment */}
            <Button
              title={copied ? t('common.copied') : t('common.share')}
              icon={copied ? 'checkmark' : 'share-outline'}
              variant="secondary"
              onPress={shareInvite}
              disabled={!invite.data}
            />
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

      {/* Anonymous (MVP) devices would come back as a new traveller, so no sign-out */}
      {demo ? (
        <Button title={t('demo.exit')} variant="secondary" icon="exit-outline" onPress={exitDemo} />
      ) : !isAnonymous ? (
        <Button title={t('settings.signOut')} variant="danger" icon="log-out-outline" onPress={signOut} />
      ) : null}
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
                <Toggle value={hasDates} onValueChange={setHasDates} label={t('settings.tripDates')} />
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
              {/* Accent colour for this trip (both partners see it) */}
              <View style={{ gap: space.sm }}>
                <Text variant="label" muted>
                  {t('settings.tripColor')}
                </Text>
                <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
                  {(Object.keys(TRIP_THEMES) as TripTheme[]).map((key) => (
                    <Pressable
                      key={key}
                      accessibilityRole="radio"
                      accessibilityLabel={t(`themes.${key}`)}
                      accessibilityState={{ selected: themeColor === key }}
                      onPress={() => setThemeColor(key)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: TRIP_THEMES[key].light.primary,
                        borderWidth: 3,
                        borderColor: themeColor === key ? c.text : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {themeColor === key ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
                    </Pressable>
                  ))}
                </Row>
              </View>
              {/* Trip photo: saved right away (not with Save), shown on Home and behind every screen */}
              <View style={{ gap: space.sm }}>
                <Text variant="label" muted>
                  {t('settings.tripPhoto')}
                </Text>
                <Row gap={space.sm}>
                  <Button
                    title={trip.cover_path ? t('settings.changePhoto') : t('settings.addPhoto')}
                    icon="image-outline"
                    variant="secondary"
                    loading={coverBusy}
                    style={{ flex: 1 }}
                    onPress={pickCover}
                  />
                  {trip.cover_path ? (
                    <Button title={t('settings.removePhoto')} icon="trash-outline" variant="danger" disabled={coverBusy} onPress={dropCover} />
                  ) : null}
                </Row>
                {coverUrl ? <Image source={{ uri: coverUrl }} resizeMode="cover" style={{ width: '100%', height: 100, borderRadius: radius.md }} /> : null}
              </View>
              {formError ? <Text color={c.danger}>{formError}</Text> : null}
            </>
          ) : null}
          {edit === 'me' && me ? (
            // Your photo: shown in your circle everywhere instead of your initial
            <Row style={{ justifyContent: 'center' }} gap={space.md}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('settings.memberPhoto')} onPress={pickMemberPhoto} disabled={photoBusy}>
                <Avatar name={me.display_name} color={me.color} photoPath={me.photo_path} size={64} />
                <View style={{ position: 'absolute', bottom: -2, end: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.card }}>
                  <Ionicons name="camera" size={13} color={c.primaryText} />
                </View>
              </Pressable>
              <View style={{ gap: space.xs }}>
                <Button title={me.photo_path ? t('settings.changePhoto') : t('settings.addPhoto')} icon="image-outline" variant="secondary" loading={photoBusy} onPress={pickMemberPhoto} />
                {me.photo_path ? <Button title={t('settings.removePhoto')} icon="trash-outline" variant="ghost" disabled={photoBusy} onPress={dropMemberPhoto} /> : null}
              </View>
            </Row>
          ) : null}
          {edit === 'me' ? (
            <Row style={{ justifyContent: 'center' }} gap={space.md}>
              {MEMBER_COLORS.map((col) => (
                <Pressable key={col} onPress={() => me && !blockedInDemo(queryClient) && updateMe.mutate({ memberId: me.id, color: col })}>
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
              if (blockedInDemo(queryClient)) return setEdit(null);
              if (edit === 'trip') {
                const s = hasDates ? isoDate(start) : null;
                const e = hasDates ? isoDate(end) : null;
                if (s && e && e < s) return setFormError(t('settings.datesInvalid'));
                await updateTrip.mutateAsync({
                  name: text.trim(),
                  start_date: s,
                  end_date: e,
                  default_currency: currency,
                  theme_color: themeColor === 'blue' ? null : themeColor,
                });
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
