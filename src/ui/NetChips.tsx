import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { HOME_CURRENCY } from '@/lib/currencies';
import type { Net } from '@/lib/ledger';
import { formatMoney } from '@/lib/money';
import { radius, space, useColors } from '@/theme';
import type { Member } from '@/types/db';
import { Row, Text } from './primitives';

/** "+₪50" / "−₪50" (a real minus sign). */
export function signedMoney(minor: number, lang: string) {
  return `${minor > 0 ? '+' : minor < 0 ? '−' : ''}${formatMoney(Math.abs(minor), HOME_CURRENCY, { lang })}`;
}

/**
 * Who gets money back and who owes, for one expense: the payer "+" in green,
 * each other person "−" in red. `max` limits how many are shown (the rest as
 * "+N").
 */
export function NetChips({ nets, memberById, meId, max, size = 'sm' }: { nets: Net[]; memberById: Map<string, Member>; meId?: string | null; max?: number; size?: 'sm' | 'md' }) {
  const c = useColors();
  const { t, lang } = useT();
  if (!nets.length) return null;
  const shown = max ? nets.slice(0, max) : nets;
  const more = nets.length - shown.length;
  return (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      {shown.map((n) => {
        const pos = n.net > 0;
        const color = pos ? c.success : c.danger;
        const name = n.memberId === meId ? t('balance.you') : memberById.get(n.memberId)?.display_name ?? '?';
        return (
          <View
            key={n.memberId}
            accessibilityLabel={t(pos ? 'balance.chipPlus' : 'balance.chipMinus', { name, amount: formatMoney(Math.abs(n.net), HOME_CURRENCY, { lang }) })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: color + '1F', borderRadius: 999, paddingHorizontal: size === 'md' ? 10 : 8, paddingVertical: size === 'md' ? 4 : 2, flexShrink: 1 }}
          >
            <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </Text>
            <Text variant="caption" color={color} style={{ fontWeight: '800' }}>
              {signedMoney(n.net, lang)}
            </Text>
          </View>
        );
      })}
      {more > 0 ? (
        <Text variant="caption" muted>
          +{more}
        </Text>
      ) : null}
    </Row>
  );
}

/**
 * Your running position in the trip (מאזן תשלומים): green "+" when others owe
 * you, red "−" when you owe, with plain words. Tapping it opens Settle up.
 */
export function BalanceBanner({ net, onPress }: { net: number; onPress?: () => void }) {
  const c = useColors();
  const { t, lang } = useT();
  const color = net > 0 ? c.success : net < 0 ? c.danger : c.textMuted;
  const words = net > 0 ? t('balance.owedToYou') : net < 0 ? t('balance.youOwe') : t('balance.even');
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${t('balance.title')}: ${words} ${net ? formatMoney(Math.abs(net), HOME_CURRENCY, { lang }) : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '55', opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" muted style={{ fontWeight: '600' }}>
          {t('balance.title')}
        </Text>
        <Text style={{ fontWeight: '700' }} color={color}>
          {words}
        </Text>
      </View>
      {net ? (
        <Text variant="h2" color={color} style={{ fontWeight: '800' }}>
          {signedMoney(net, lang)}
        </Text>
      ) : null}
    </Pressable>
  );
}
