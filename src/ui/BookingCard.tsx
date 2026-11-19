import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { bookingCode, bookingTime, mapsUrl, nights, type Booking } from '@/lib/booking';
import { FEATURES } from '@/lib/features';
import { supabase } from '@/lib/supabase';
import { radius, space, useColors } from '@/theme';
import { Row, Text } from './primitives';

const isIos = Platform.OS === 'ios' || (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent ?? ''));

/**
 * Smart Booking Card: the flight or hotel kept on an expense, at the top of its
 * details. One tap copies the booking code; a hotel opens in Maps. The Apple
 * Wallet button shows only when FEATURES.appleWalletPasses is on.
 */
export function BookingCard({ booking: b, expenseId }: { booking: Booking; expenseId: string }) {
  const c = useColors();
  const { t, lang } = useT();
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const [copied, setCopied] = useState(false);
  const [walletMsg, setWalletMsg] = useState<string | null>(null);
  const code = bookingCode(b);
  const map = mapsUrl(b, isIos ? 'ios' : 'other');
  const n = nights(b);

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const addToWallet = async () => {
    const { error } = await supabase.functions.invoke('generate-flight-pass', { body: { expense_id: expenseId } });
    setWalletMsg(error ? t('booking.walletSoon') : null);
  };

  const Stat = ({ label, value }: { label: string; value: string | null | undefined }) =>
    value ? (
      <View style={{ flex: 1, minWidth: 90, gap: 2 }}>
        <Text variant="caption" muted>
          {label}
        </Text>
        <Text style={{ fontWeight: '700' }} numberOfLines={2}>
          {value}
        </Text>
      </View>
    ) : null;

  return (
    <View
      accessibilityLabel={b.kind === 'flight' ? t('booking.flight') : t('booking.hotel')}
      style={{ borderRadius: radius.lg, padding: space.lg, gap: space.md, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary + '33' }}
    >
      <Row gap={space.sm}>
        <Text style={{ fontSize: 22 }}>{b.kind === 'flight' ? '✈️' : '🏨'}</Text>
        <Text variant="h2" style={{ flex: 1 }} numberOfLines={2}>
          {b.kind === 'flight' ? [b.airline, b.flight_number].filter(Boolean).join(' ') || t('booking.flight') : b.property_name || t('booking.hotel')}
        </Text>
      </Row>

      {b.kind === 'flight' ? (
        <>
          {b.origin_iata || b.destination_iata ? (
            // Airport codes read left to right in both languages
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, direction: 'ltr' } as object}>
              <Text variant="hero">{b.origin_iata ?? '?'}</Text>
              <Ionicons name="airplane" size={22} color={c.primary} />
              <Text variant="hero">{b.destination_iata ?? '?'}</Text>
            </View>
          ) : null}
          <Row gap={space.md} style={{ flexWrap: 'wrap' }} align="flex-start">
            <Stat label={t('booking.departs')} value={bookingTime(b.departure_at, locale)} />
            <Stat label={t('booking.arrives')} value={bookingTime(b.arrival_at, locale)} />
          </Row>
          {b.passengers?.length ? <Stat label={t('booking.passengers')} value={b.passengers.join(', ')} /> : null}
        </>
      ) : (
        <>
          <Row gap={space.md} style={{ flexWrap: 'wrap' }} align="flex-start">
            <Stat label={t('booking.checkIn')} value={bookingTime(b.check_in_date, locale)} />
            <Stat label={t('booking.checkOut')} value={bookingTime(b.check_out_date, locale)} />
            {n ? <Stat label={t('booking.nightsLabel')} value={t('booking.nights', { count: n })} /> : null}
          </Row>
          {b.room_info ? <Stat label={t('booking.room')} value={b.room_info} /> : null}
          {b.address || b.city ? <Stat label={t('booking.address')} value={[b.address, b.address ? null : b.city].filter(Boolean).join(', ')} /> : null}
        </>
      )}

      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {code ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('common.copy')} ${code}`}
            onPress={copy}
            style={{ flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, height: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: copied ? c.primary : c.border }}
          >
            <View>
              <Text variant="caption" muted>
                {b.kind === 'flight' ? t('booking.pnr') : t('booking.confirmation')}
              </Text>
              <Text style={{ fontWeight: '800', letterSpacing: 1.5 }}>{code}</Text>
            </View>
            <Row gap={4}>
              <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
                {copied ? t('common.copied') : t('common.copy')}
              </Text>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={c.primary} />
            </Row>
          </Pressable>
        ) : null}
        {map ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(map)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}
          >
            <Ionicons name="map-outline" size={18} color={c.primary} />
            <Text style={{ fontWeight: '700' }} color={c.primary}>
              {t('booking.openMap')}
            </Text>
          </Pressable>
        ) : null}
        {FEATURES.appleWalletPasses && b.kind === 'flight' ? (
          <Pressable
            accessibilityRole="button"
            onPress={addToWallet}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: '#000' }}
          >
            <Ionicons name="wallet-outline" size={18} color="#fff" />
            <Text style={{ fontWeight: '700' }} color="#fff">
              {t('booking.addToWallet')}
            </Text>
          </Pressable>
        ) : null}
      </Row>
      {walletMsg ? (
        <Text variant="caption" muted>
          {walletMsg}
        </Text>
      ) : null}
    </View>
  );
}
