import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { pairBreakdown, type PairLine } from '@/lib/ledger';
import { dayKey } from '@/lib/stats';
import { radius, space, useColors } from '@/theme';
import type { Expense } from '@/types/db';
import { signedMoney } from './NetChips';
import { Sheet, SheetScrollView } from './Sheet';
import { Avatar, Divider, Row, Text } from './primitives';

/**
 * Settle up › a person: everything between you and them. On top the net
 * (green: they owe you, red: you owe them), then what you paid for them and
 * what they paid for you, each with your side of it. Tapping a line opens the
 * expense.
 */
export function PairSheet({ otherId, onClose }: { otherId: string | null; onClose: () => void }) {
  const c = useColors();
  const { t, lang } = useT();
  const { trip, expenses, memberById, categoryById, me } = useTripData();
  const other = otherId ? memberById.get(otherId) : undefined;

  const data = useMemo(() => {
    if (!me || !otherId) return null;
    const list = expenses.filter((e) => !e.deleted_at && e.pending_op !== 'delete').map((e) => ({ ...e, splits: e.expense_splits }));
    return pairBreakdown(list, me.id, otherId);
  }, [expenses, me, otherId]);

  const name = other?.display_name ?? '';
  const net = data?.net ?? 0;
  const color = net > 0 ? c.success : net < 0 ? c.danger : c.textMuted;

  const Line = ({ l, sign }: { l: PairLine<Expense & { splits: unknown }>; sign: 1 | -1 }) => {
    const e = l.expense;
    const title = e.kind === 'settlement' ? t('balance.payback') : e.description || categoryLabel(e.category_id ? categoryById.get(e.category_id) : undefined, t);
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onClose();
          router.push({ pathname: '/expense/[id]', params: { id: e.id, src: '1' } });
        }}
        style={({ pressed }) => ({ paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
      >
        <Row gap={space.md}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontWeight: '600' }} numberOfLines={1}>
              {title}
            </Text>
            <Text variant="caption" muted>
              {trip ? new Date(`${dayKey(e.occurred_at, trip.timezone)}T12:00:00`).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' }) : ''}
            </Text>
          </View>
          <Text variant="mono" color={sign > 0 ? c.success : c.danger} style={{ fontWeight: '700' }}>
            {signedMoney(sign * l.amount, lang)}
          </Text>
        </Row>
      </Pressable>
    );
  };

  return (
    <Sheet visible={!!otherId} onClose={onClose} title={name} height="85%">
      <SheetScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        {data && other ? (
          <>
            {/* The net between the two of you */}
            <View style={{ alignItems: 'center', gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: color + '18' }}>
              <Avatar name={other.display_name} color={other.color} photoPath={other.photo_path} size={48} />
              <Text style={{ fontWeight: '700' }} color={color} center>
                {net > 0 ? t('balance.pairOwesYou', { name }) : net < 0 ? t('balance.pairYouOwe', { name }) : t('balance.pairEven', { name })}
              </Text>
              {net ? (
                <Text variant="hero" color={color}>
                  {signedMoney(net, lang)}
                </Text>
              ) : null}
              <Text variant="caption" muted center>
                {t('balance.pairNote')}
              </Text>
            </View>

            <View style={{ gap: 0 }}>
              <Text variant="label" muted>
                {t('balance.youPaidFor', { name })}
              </Text>
              {data.youPaid.length ? (
                data.youPaid.map((l, i) => (
                  <View key={l.expense.id}>
                    {i > 0 ? <Divider /> : null}
                    <Line l={l} sign={1} />
                  </View>
                ))
              ) : (
                <Text variant="caption" faint style={{ paddingVertical: space.sm }}>
                  {t('balance.nothing')}
                </Text>
              )}
            </View>

            <View style={{ gap: 0 }}>
              <Text variant="label" muted>
                {t('balance.theyPaidFor', { name })}
              </Text>
              {data.theyPaid.length ? (
                data.theyPaid.map((l, i) => (
                  <View key={l.expense.id}>
                    {i > 0 ? <Divider /> : null}
                    <Line l={l} sign={-1} />
                  </View>
                ))
              ) : (
                <Text variant="caption" faint style={{ paddingVertical: space.sm }}>
                  {t('balance.nothing')}
                </Text>
              )}
            </View>
          </>
        ) : null}
      </SheetScrollView>
    </Sheet>
  );
}
