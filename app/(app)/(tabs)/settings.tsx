import { PasskeysCard } from '@/ui/Passkeys';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Platform, Pressable, Share, View, type ScrollViewInstance } from 'react-native';
import { inviteLink, whatsappUrl } from '@/lib/inviteLink';
import * as ImagePicker from 'expo-image-picker';
import { removeMemberPhoto, removeTripCover, uploadMemberPhoto, uploadTripCover, useDeleteTrip, useInviteCode, useRemoveMember, useTripChanges, useTrips } from '@/api/queries';
import { errorCode } from '@/lib/supabase';
import { TRIP_THEMES, type TripTheme } from '@/palette';
import { useTripLook } from '@/store/tripLook';
import { useTripData } from '@/hooks/useTripData';
import { applyDirection, initI18n, useT, type Lang } from '@/i18n';
import { currencyName, getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { canvasToJpegUrl } from '@/lib/image';
import { groupThousands } from '@/lib/amountInput';
import { minorToInput, parseAmount } from '@/lib/money';
import { useAuth, useUserId } from '@/providers/AuthProvider';
import { useExitDemo } from '@/hooks/useExitDemo';
import { useSignOut } from '@/hooks/useSignOut';
import { blockedInDemo } from '@/lib/demoPrompt';
import { seedDemo } from '@/lib/demoSeed';
import i18n from '@/i18n';
import { useIsDemo, usePrefs } from '@/store/prefs';
import { useScrollTopOnTabTap } from '@/store/tabTap';
import { MEMBER_COLORS, radius, space, useColors } from '@/theme';
import { confirmDialog, showDialog } from '@/ui/Dialog';
import { CopyCode } from '@/ui/CopyCode';
import { CurrencyPicker } from '@/ui/CurrencyPicker';
import { DateField } from '@/ui/DateField';
import { ImageCropper } from '@/ui/ImageCropper';
import { Sheet } from '@/ui/Sheet';
import { Avatar, Button, Card, Chip, Divider, Field, ListRow, Row, Screen, Segmented, Text, Toggle } from '@/ui/primitives';
import { CountryPicker } from '@/ui/CountryPicker';
import { countryFlag, countryName } from '@/lib/countries';
import { feeFromInput, feeToInput, memberFeePct, vatRule } from '@/lib/taxFree';
import { UploadZone } from '@/ui/UploadZone';
import { SwipeRow } from '@/ui/SwipeRow';
import type { Trip } from '@/types/db';

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Settings() {
  const { t, lang } = useT();
  const c = useColors();
  const { trip, members, me, budgets } = useTripData();
  const trips = useTrips();
  const invite = useInviteCode(trip && !trip.shared ? trip.id : undefined);
  // Trip details, colour, budget and your name: shown at once, sent when there is a connection (also offline)
  const changes = useTripChanges(trip?.id ?? '');
  const totalBudget = budgets.find((b) => b.scope === 'total')?.amount_ils_minor ?? null;
  const removeMember = useRemoveMember(trip?.id ?? '');
  const userId = useUserId();
  const deleteTrip = useDeleteTrip();
  const setLang = usePrefs((s) => s.setLang);
  const setActiveTrip = usePrefs((s) => s.setActiveTrip);
  const queryClient = useQueryClient();
  const isAnonymous = useAuth().session?.user.is_anonymous ?? false;
  const demo = useIsDemo();
  const exitDemo = useExitDemo();
  const signOut = useSignOut();
  const isCreator = !!trip && !trip.shared && !demo && trip.created_by === userId;
  const [edit, setEdit] = useState<null | 'trip' | 'me'>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  useScrollTopOnTabTap('settings', scrollRef);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [hasDates, setHasDates] = useState(false);
  const [start, setStart] = useState(new Date());
  const [end, setEnd] = useState(new Date());
  const [currency, setCurrency] = useState('THB');
  const [themeColor, setThemeColor] = useState<TripTheme>('blue');
  // Total trip budget in shekels, as typed; empty = no budget
  const [budgetText, setBudgetText] = useState('');
  // Card foreign-transaction fee (%) as typed, and the trip's destinations (VAT refund rules)
  const [feeText, setFeeText] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [pickCountries, setPickCountries] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  // A picked profile photo waiting to be cropped (browser)
  const [cropUri, setCropUri] = useState<string | null>(null);
  const coverUrl = useTripLook((s) => s.coverUrl);
  const [pickCurrency, setPickCurrency] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /** Opens Trip details with the trip's current values. */
  function openTripEdit() {
    if (!trip) return;
    setText(trip.name);
    setHasDates(!!trip.start_date);
    setStart(trip.start_date ? new Date(trip.start_date + 'T12:00:00') : new Date());
    setEnd(trip.end_date ? new Date(trip.end_date + 'T12:00:00') : new Date(Date.now() + 14 * 86_400_000));
    setCurrency(trip.default_currency);
    setThemeColor((trip.theme_color as TripTheme | null) ?? 'blue');
    setBudgetText(totalBudget ? groupThousands(minorToInput(totalBudget, HOME_CURRENCY)) : '');
    setFeeText(feeToInput(memberFeePct(me, trip)));
    setCountries(trip.countries ?? []);
    setFormError(null);
    setEdit('trip');
  }
  // Opened from Home's "No budget set" link: straight to Trip details
  const { edit: editParam } = useLocalSearchParams<{ edit?: string }>();
  useEffect(() => {
    if (editParam !== 'trip' || !trip) return;
    openTripEdit();
    router.setParams({ edit: undefined });
  }, [editParam, trip?.id]);

  /**
   * Swipe › Delete on a trip. Its creator is asked to confirm, then the trip
   * and everything in it is deleted for everyone. Anyone else is told that
   * only the creator can delete it.
   */
  async function askDeleteTrip(tr: Trip) {
    if (blockedInDemo(queryClient)) return;
    if (tr.created_by !== userId) {
      showDialog(t('settings.deleteTripOnlyCreator'), t('settings.deleteTripOnlyCreatorBody'));
      return;
    }
    if (!onlineManager.isOnline()) {
      showDialog(t('settings.deleteTrip'), t('settings.deleteTripOffline'));
      return;
    }
    const yes = await confirmDialog(t('settings.deleteTripConfirm'), t('settings.deleteTripBody', { name: tr.name }), t('common.delete'), t('common.cancel'), true);
    if (!yes) return;
    try {
      await deleteTrip.mutateAsync(tr.id);
    } catch (e) {
      showDialog(t('errors.title'), t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    }
  }

  if (!trip) return null;

  async function pickCover() {
    if (!trip || blockedInDemo(queryClient)) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    await saveCover(res.assets[0].uri);
  }

  async function saveCover(uri: string) {
    if (!trip || blockedInDemo(queryClient)) return;
    setCoverBusy(true);
    setFormError(null);
    try {
      await uploadTripCover(trip.id, uri, trip.cover_path);
      await queryClient.invalidateQueries({ queryKey: ['trips'] });
    } catch (e) {
      setFormError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    } finally {
      setCoverBusy(false);
    }
  }

  async function pickMemberPhoto() {
    if (!trip || !me || blockedInDemo(queryClient)) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: Platform.OS !== 'web', aspect: [1, 1] });
    if (res.canceled || !res.assets[0]) return;
    // Browser: crop and zoom first; the phone app's picker already did
    if (Platform.OS === 'web') return setCropUri(res.assets[0].uri);
    await saveMemberPhoto(res.assets[0].uri);
  }

  async function saveMemberPhoto(uri: string) {
    if (!trip || !me) return;
    setPhotoBusy(true);
    setFormError(null);
    try {
      await uploadMemberPhoto(trip.id, me.id, uri, me.photo_path);
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

  const inviteMessage = (code: string) => t('settings.inviteShare', { trip: trip.name, link: inviteLink(code), code });

  function whatsappInvite() {
    if (!invite.data) return;
    Linking.openURL(whatsappUrl(inviteMessage(invite.data))).catch(() => {});
  }

  async function shareInvite() {
    if (!invite.data) return;
    const message = inviteMessage(invite.data);
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      await Share.share({ message });
    }
  }

  return (
    <Screen ref={scrollRef}>
      <Text variant="title">{t('settings.title')}</Text>

      {/* Trips (not in the shared MVP trip: a separate trip would be invisible to the partner) */}
      {!trip.shared ? (
        <Card style={{ gap: 0 }}>
          <Text variant="label" muted>
            {t('settings.trips')}
          </Text>
          <Text variant="caption" faint style={{ marginTop: 2, marginBottom: space.xs }}>
            {t('settings.tripsHint')}
          </Text>
          {/* Swipe a trip (right in Hebrew) for Delete: the creator confirms, anyone else is told only the creator can */}
          {(trips.data ?? []).map((tr) => (
            <SwipeRow
              key={tr.id}
              background={c.card}
              style={{ borderRadius: radius.md }}
              actions={[
                {
                  key: 'delete',
                  icon: 'trash-outline',
                  color: tr.created_by === userId ? c.danger : c.textFaint,
                  label: t('common.delete'),
                  onPress: () => void askDeleteTrip(tr),
                },
              ]}
            >
              {(guardTap) => (
                <ListRow
                  icon={<Ionicons name={tr.id === trip.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={c.primary} />}
                  title={tr.name}
                  subtitle={deleteTrip.isPending && deleteTrip.variables === tr.id ? t('common.loading') : undefined}
                  onPress={guardTap(() => setActiveTrip(tr.id))}
                />
              )}
            </SwipeRow>
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
          onPress={openTripEdit}
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
            <Button title={t('settings.inviteWhatsapp')} icon="logo-whatsapp" onPress={whatsappInvite} disabled={!invite.data} />
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

      {/* Face ID / passkey (only where supported and turned on) */}
      <PasskeysCard />

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
            // No autoFocus: the keyboard would cover the trip details
            autoFocus={edit !== 'trip'}
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
              <Divider />
              {/* The whole trip's budget in shekels (Home shows progress against it); empty = none */}
              <Field
                label={members.length < 2 ? t('settings.tripBudgetSolo') : t('settings.tripBudget')}
                value={budgetText}
                onChangeText={setBudgetText}
                amountDecimals={2}
                keyboardType="decimal-pad"
                placeholder={t('settings.tripBudgetPlaceholder')}
                hint={members.length < 2 ? t('settings.tripBudgetHintSolo') : t('settings.tripBudgetHint')}
              />
              <Field
                label={t('taxFree.feeLabel')}
                value={feeText}
                onChangeText={(v) => setFeeText(v.replace(',', '.').replace(/[^\d.]/g, '').slice(0, 5))}
                keyboardType="decimal-pad"
                placeholder="0"
                hint={t('taxFree.feeHint')}
              />
              <Divider />
              {/* Destinations: the expense's location is picked from these, and they set the VAT refund rules */}
              <View style={{ gap: space.sm }}>
                <Text variant="label" muted>
                  {t('taxFree.countries')}
                </Text>
                {countries.length ? (
                  <Row style={{ flexWrap: 'wrap' }} gap={6}>
                    {countries.map((code) => (
                      <Chip
                        key={code}
                        // A green check on destinations with a VAT refund
                        icon={
                          <Row gap={4}>
                            {vatRule(code) && !vatRule(code)!.noRefund ? <Ionicons name="checkmark-circle" size={15} color={c.success} accessibilityLabel={t('countries.hasRefund')} /> : null}
                            <Text style={{ fontSize: 15 }}>{countryFlag(code)}</Text>
                          </Row>
                        }
                        label={`${countryName(code, lang)}  ✕`}
                        selected
                        onPress={() => setCountries((list) => list.filter((x) => x !== code))}
                      />
                    ))}
                  </Row>
                ) : null}
                <Button title={t('countries.add')} icon="add" variant="secondary" onPress={() => setPickCountries(true)} />
                <Text variant="caption" muted>
                  {t('taxFree.countriesHint')}
                </Text>
              </View>
              <Divider />
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
              <Divider />
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
              <Divider />
              {/* Trip photo: saved right away (not with Save), shown on Home and behind every screen */}
              <View style={{ gap: space.sm }}>
                <Text variant="label" muted>
                  {t('settings.tripPhoto')}
                </Text>
                <UploadZone
                  title={trip.cover_path ? t('settings.changePhoto') : t('settings.addPhoto')}
                  onPress={pickCover}
                  onDropFile={(uri) => void saveCover(uri)}
                  busy={coverBusy}
                  compact
                />
                {trip.cover_path ? (
                  <Button title={t('settings.removePhoto')} icon="trash-outline" variant="danger" disabled={coverBusy} onPress={dropCover} />
                ) : null}
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
              <View style={{ gap: space.xs, flexShrink: 1 }}>
                <UploadZone
                  title={me.photo_path ? t('settings.changePhoto') : t('settings.addPhoto')}
                  onPress={pickMemberPhoto}
                  onDropFile={(uri) => !blockedInDemo(queryClient) && setCropUri(uri)}
                  busy={photoBusy}
                  compact
                />
                {me.photo_path ? <Button title={t('settings.removePhoto')} icon="trash-outline" variant="ghost" disabled={photoBusy} onPress={dropMemberPhoto} /> : null}
              </View>
            </Row>
          ) : null}
          {edit === 'me' ? (
            <Row style={{ justifyContent: 'center' }} gap={space.md}>
              {MEMBER_COLORS.map((col) => (
                <Pressable key={col} onPress={() => me && !blockedInDemo(queryClient) && changes.updateMyMember(me.id, { color: col })}>
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
            disabled={!text.trim()}
            onPress={() => {
              if (blockedInDemo(queryClient)) return setEdit(null);
              if (edit === 'trip') {
                const s = hasDates ? isoDate(start) : null;
                const e = hasDates ? isoDate(end) : null;
                if (s && e && e < s) return setFormError(t('settings.datesInvalid'));
                const budget = budgetText.trim() ? parseAmount(budgetText, HOME_CURRENCY) : null;
                if (budgetText.trim() && (budget == null || budget <= 0)) return setFormError(t('errors.invalid_amount'));
                if (budget !== totalBudget) changes.setBudget('total', budget);
                // 0 is a real fee (0%), empty is unset
                const fee = feeFromInput(feeText);
                if (fee != null && Number.isNaN(fee)) return setFormError(t('errors.invalid_fee'));
                changes.updateTrip({
                  name: text.trim(),
                  start_date: s,
                  end_date: e,
                  default_currency: currency,
                  theme_color: themeColor === 'blue' ? null : themeColor,
                  countries,
                });
                // The card fee is each person's own (their card), saved on their member row
                const myFee = memberFeePct(me, trip);
                if (me && (myFee == null ? null : Number(myFee)) !== fee) changes.updateMyMember(me.id, { card_fx_fee_pct: fee });
              }
              else if (me) changes.updateMyMember(me.id, { display_name: text.trim() });
              setEdit(null);
            }}
          />
        </View>
      </Sheet>
      <CurrencyPicker visible={pickCurrency} value={currency} onSelect={setCurrency} onClose={() => setPickCurrency(false)} />
      <CountryPicker
        visible={pickCountries}
        multi
        title={t('taxFree.countries')}
        selected={countries}
        onPick={(code) => setCountries((list) => (list.includes(code) ? list.filter((x) => x !== code) : list.length >= 10 ? list : [...list, code]))}
        onClose={() => setPickCountries(false)}
      />
      <ImageCropper
        uri={cropUri}
        shape="circle"
        outputSize={512}
        fit="cover"
        onCancel={() => setCropUri(null)}
        onConfirm={async (canvas) => {
          const url = await canvasToJpegUrl(canvas);
          setCropUri(null);
          try {
            await saveMemberPhoto(url);
          } finally {
            URL.revokeObjectURL(url);
          }
        }}
      />
    </Screen>
  );
}
