import { Pressable, View } from 'react-native';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { formatMoney } from '@/lib/money';
import { HOME_CURRENCY } from '@/lib/currencies';
import { useT } from '@/i18n';
import { space, useColors } from '@/theme';
import type { Category, Expense, Member } from '@/types/db';
import { Dot, Row, Text } from './primitives';

/** One expense: category, description, payer, and the amount in both currencies. */
export function ExpenseRow({
  expense,
  category,
  payer,
  recipient,
  onPress,
}: {
  expense: Expense;
  category?: Category;
  payer?: Member;
  /** For settlement payments: who received the money. */
  recipient?: Member;
  onPress?: () => void;
}) {
  const c = useColors();
  const { t, lang } = useT();
  const isHome = expense.currency === HOME_CURRENCY;
  const title =
    expense.kind === 'settlement'
      ? t('settle.rowTitle', { name: recipient?.display_name ?? '' })
      : expense.description || categoryLabel(category, t);
  const time = new Date(expense.occurred_at).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Row gap={space.md} style={{ paddingVertical: 10 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: (category?.color ?? UNCATEGORIZED.color) + '22',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 22 }}>{expense.kind === 'settlement' ? '🤝' : category?.icon ?? UNCATEGORIZED.icon}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Text>
          <Row gap={6}>
            {payer ? <Dot color={payer.color} size={8} /> : null}
            <Text variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>
              {payer?.display_name ?? ''} · {time}
            </Text>
          </Row>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text variant="mono">{formatMoney(expense.amount_ils_minor, HOME_CURRENCY, { lang })}</Text>
          {!isHome ? (
            <Text variant="caption" muted>
              {formatMoney(expense.amount_minor, expense.currency, { lang })}
            </Text>
          ) : null}
        </View>
      </Row>
    </Pressable>
  );
}
