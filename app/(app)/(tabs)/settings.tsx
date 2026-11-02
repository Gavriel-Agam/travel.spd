import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, Share, View } from 'react-native';
import { useInviteCode, useTrips, useUpdateMyMember, useUpdateTrip } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { applyDirection, initI18n, useT, type Lang } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/store/prefs';
import { MEMBER_COLORS, radius, space, useColors } from '@/theme';
import { Sheet } from '@/ui/Sheet';
import { Avatar, Button, Card, Divider, Field, ListRow, Row, Screen, Segmented, Text } from '@/ui/primitives';

export default function Settings() {
  const { t, lang } = useT();
  const c = useColors();
  const { trip, members, me } = useTripData();
  const trips = useTrips();
  const invite = useInviteCode(trip?.id);
  const updateTrip = useUpdateTrip(trip?.id ?? '');
  const updateMe = useUpdateMyMember(trip?.id ?? '');
  const setLang = usePrefs((s) => s.setLang);
  const setActiveTrip = usePrefs((s) => s.setActiveTrip);
  const [edit, setEdit] = useState<null | 'trip' | 'me'>(null);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  if (!trip) return null;

  function changeLang(l: Lang) {
    setLang(l);
    initI18n(l);
    if (applyDirection(l)) Alert.alert(t('settings.language'), t('settings.languageRestart'));
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

  function signOut() {
    const run = async () => {
      setActiveTrip(null);
      await supabase.auth.signOut();
    };
    if (Platform.OS === 'web') return run();
    Alert.alert(t('settings.signOutConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: run },
    ]);
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
          subtitle={[trip.start_date, trip.end_date].filter(Boolean).join(' → ')}
          chevron
          onPress={() => {
            setText(trip.name);
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

      {/* Trips */}
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

      <Button title={t('settings.signOut')} variant="danger" icon="log-out-outline" onPress={signOut} />
      <Text variant="caption" faint center>
        {t('settings.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}
      </Text>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit === 'trip' ? t('settings.tripName') : t('settings.myName')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Field value={text} onChangeText={setText} autoFocus maxLength={edit === 'trip' ? 80 : 40} />
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
              if (edit === 'trip') await updateTrip.mutateAsync({ name: text.trim() });
              else if (me) await updateMe.mutateAsync({ memberId: me.id, display_name: text.trim() });
              setEdit(null);
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
