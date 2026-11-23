import { expenseNets } from '@/lib/ledger';
import { NetChips } from './NetChips';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useReceiptSrc } from '@/api/queries';
import { bookingTag } from '@/lib/booking';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { formatMoney } from '@/lib/money';
import { HOME_CURRENCY } from '@/lib/currencies';
import { useT } from '@/i18n';
import { space, useColors } from '@/theme';
import type { Category, Expense, Member } from '@/types/db';
import { CategoryIcon } from './CategoryIcon';
import { Loading, Row, Text } from './primitives';
import { Sheet } from './Sheet';

/** The receipt photo, opened from the 🧾 on a row (works offline once it was opened or saved here). */
function ReceiptSheet({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useT();
  const src = useReceiptSrc(path);
  return (
    <Sheet visible onClose={onClose} title={t('details.receipt')}>
      {src.url ? (
        <Image source={{ uri: src.url }} style={{ width: '100%', height: 480 }} resizeMode="contain" accessibilityLabel={t('details.receipt')} />
      ) : src.loading ? (
        <Loading />
      ) : (
        <Text muted center>
          {t('expenses.receiptOffline')}
        </Text>
      )}
    </Sheet>
  );
}

/**
 * One expense: category, description and the amount in both currencies. Under
 * the description only a payer badge (when one person paid) or a sync status;
 * joint-money rows stay clean.
 */
export function ExpenseRow({
  expense,
  category,
  payer,
  recipient,
  memberById,
  meId,
  onPress,
  onLongPress,
}: {
  expense: Expense;
  category?: Category;
  payer?: Member;
  /** For settlement payments: who received the money. */
  recipient?: Member;
  /** With it, a shared expense shows who gets back (+, green) and who owes (−, red) instead of the payer badge. */
  memberById?: Map<string, Member>;
  meId?: string | null;
  onPress?: () => void;
  /** Set when the row can be held to drag it (so the hold doesn't also open it). */
  onLongPress?: () => void;
}) {
  const c = useColors();
  const { t, lang } = useT();
  const isHome = expense.currency === HOME_CURRENCY;
  const [receiptOpen, setReceiptOpen] = useState(false);
  const tag = bookingTag(expense.booking_details, lang === 'he' ? 'he-IL' : 'en-US');
  const pendingReview = expense.review_status === 'pending_review';
  // Who gets back and who owes (two people at most, then +N), for shared expenses
  const nets = memberById && expense.kind === 'expense' && !pendingReview ? expenseNets({ ...expense, splits: expense.expense_splits }) : [];
  const title =
    expense.kind === 'settlement'
      ? t('settle.rowTitle', { name: recipient?.display_name ?? '' })
      : expense.description || categoryLabel(category, t);
  return (
    <>
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
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
          <CategoryIcon category={category} size={22} emoji={expense.kind === 'settlement' ? '🤝' : undefined} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Text>
          {tag ? (
            // A flight's codes and route read left to right in both languages; stay dates follow the language
            <Text
              variant="caption"
              color={c.primary}
              numberOfLines={1}
              style={[{ fontWeight: '600' }, expense.booking_details?.kind === 'flight' ? { writingDirection: 'ltr', textAlign: lang === 'he' ? 'right' : 'left' } : null]}
            >
              {expense.booking_details?.kind === 'hotel' ? '🏨' : '✈️'} {tag}
            </Text>
          ) : null}
          {payer || expense.pending || pendingReview ? (
            <Row gap={6}>
              {pendingReview ? (
                <Text variant="caption" color={c.warning} numberOfLines={1} style={{ fontWeight: '600' }}>
                  {t('pending.rowBadge')}
                </Text>
              ) : null}
              {nets.length ? (
                <View style={{ flexShrink: 1 }}>
                  <NetChips nets={nets} memberById={memberById!} meId={meId} max={3} />
                </View>
              ) : payer ? (
                <View
                  accessibilityLabel={`${t('details.paidBy')}: ${payer.display_name}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: payer.color + '1F', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 1 }}
                >
                  <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>
                    👤 {payer.display_name}
                  </Text>
                </View>
              ) : null}
              {expense.pending ? (
                <Text variant="caption" color={expense.pending === 'failed' ? c.danger : c.warning} numberOfLines={1}>
                  {expense.pending === 'failed' ? t('sync.rowFailed') : t('sync.rowWaiting')}
                </Text>
              ) : null}
            </Row>
          ) : null}
        </View>
        {expense.receipt_path ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('details.receipt')}
            hitSlop={6}
            onPress={() => setReceiptOpen(true)}
            style={{ padding: 6, borderRadius: 999, backgroundColor: c.cardAlt }}
          >
            <Ionicons name="receipt-outline" size={16} color={c.textMuted} />
          </Pressable>
        ) : null}
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
    {/* Outside the row, so taps in the sheet don't open the expense */}
    {receiptOpen && expense.receipt_path ? <ReceiptSheet path={expense.receipt_path} onClose={() => setReceiptOpen(false)} /> : null}
    </>
  );
}
