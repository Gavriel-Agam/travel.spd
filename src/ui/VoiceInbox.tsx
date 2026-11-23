import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';
import { useVoiceExpense } from '@/hooks/useVoiceExpense';
import { useT } from '@/i18n';
import { getCurrency } from '@/lib/currencies';
import { clampDecimals } from '@/lib/money';
import { useVoice, type VoiceCapture } from '@/store/voice';
import { radius, space, useColors } from '@/theme';
import { Row, Text, tap } from './primitives';

const clock = (ms?: number) => (ms ? `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}` : '');

/**
 * Voice expenses not saved yet, at the top of Home and Expenses: being read,
 * waiting for a connection, waiting for an amount (type it, Enter saves), or
 * failed (try again / discard). Shown only while there are some.
 */
export function VoiceInbox({ tripId }: { tripId: string | undefined }) {
  const all = useVoice((s) => s.captures);
  const list = all.filter((x) => x.tripId === tripId);
  if (!list.length) return null;
  return (
    <View style={{ gap: space.sm, marginBottom: space.md }}>
      {list.map((cap) => (
        <CaptureRow key={cap.id} cap={cap} />
      ))}
    </View>
  );
}

function CaptureRow({ cap }: { cap: VoiceCapture }) {
  const c = useColors();
  const { t } = useT();
  const { retry, discard, setAmount } = useVoiceExpense();
  const [amount, setAmountText] = useState('');
  const [error, setError] = useState(false);
  const warn = cap.status === 'needs_amount';
  const failed = cap.status === 'failed';

  const title =
    cap.status === 'processing'
      ? t('voice.processing')
      : cap.status === 'queued_offline'
        ? t('voice.offline')
        : warn
          ? t('voice.noAmount')
          : cap.error === 'not_expense'
            ? t('voice.notExpense')
            : cap.error === 'RATE_LIMIT_EXCEEDED'
              ? t('voice.limit')
              : cap.error === 'no_rate'
                ? t('voice.noRate')
                : t('voice.failed');
  const icon = cap.status === 'queued_offline' ? 'cloud-offline-outline' : warn ? 'help-circle' : failed ? 'alert-circle' : 'mic';
  const tint = warn ? c.warning : failed ? c.danger : c.primary;
  const said = cap.transcript || cap.text;
  const currency = cap.draft?.currency ?? '';
  const decimals = currency ? getCurrency(currency).minor_units : 2;

  const save = async () => {
    if (!(await setAmount(cap.id, amount))) return setError(true);
    tap();
  };

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ padding: space.md, gap: space.sm, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: warn ? c.warning : failed ? c.danger + '66' : c.border }}
    >
      <Row gap={space.sm}>
        {cap.status === 'processing' ? <ActivityIndicator size="small" color={c.primary} /> : <Ionicons name={icon} size={20} color={tint} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: '700' }} numberOfLines={2}>
            {title}
          </Text>
          {said ? (
            <Text variant="caption" muted numberOfLines={2} style={{ fontStyle: 'italic' }}>
              "{said}"
            </Text>
          ) : cap.durationMs ? (
            <Text variant="caption" muted>
              🎙 {clock(cap.durationMs)}
            </Text>
          ) : null}
        </View>
        {failed && cap.error !== 'not_expense' && cap.error !== 'RATE_LIMIT_EXCEEDED' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.retry')} hitSlop={8} onPress={() => void retry(cap.id)} style={{ padding: 6 }}>
            <Ionicons name="refresh" size={20} color={c.primary} />
          </Pressable>
        ) : null}
        {cap.status !== 'processing' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('voice.discard')} hitSlop={8} onPress={() => discard(cap.id)} style={{ padding: 6 }}>
            <Ionicons name="close" size={20} color={c.textMuted} />
          </Pressable>
        ) : null}
      </Row>
      {warn ? (
        <Row gap={space.sm}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, backgroundColor: c.cardAlt, paddingHorizontal: space.md, borderWidth: error ? 1 : 0, borderColor: c.danger }}>
            <TextInput
              value={amount}
              onChangeText={(v) => {
                setError(false);
                setAmountText(clampDecimals(v, decimals));
              }}
              autoFocus
              inputMode="decimal"
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={c.textMuted}
              accessibilityLabel={`${t('voice.amountLabel')} ${currency}`}
              returnKeyType="done"
              onSubmitEditing={() => void save()}
              style={[{ flex: 1, minWidth: 0, height: 44, fontSize: 18, fontWeight: '700', color: c.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
            <Text muted style={{ fontWeight: '700' }}>
              {currency}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void save()}
            style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Text style={{ fontWeight: '700' }} color={c.primaryText}>
              {t('voice.saveAmount')}
            </Text>
          </Pressable>
        </Row>
      ) : null}
      {error ? (
        <Text variant="caption" color={c.danger}>
          {t('voice.invalidAmount')}
        </Text>
      ) : null}
    </View>
  );
}
