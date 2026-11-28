import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { nearDuplicateOf } from '@/lib/pendingReview';
import { radius, space, useColors } from '@/theme';
import type { Expense } from '@/types/db';
import { ApplePayMark } from './ApplePayMark';
import { Card, Row, Text, tap } from './primitives';

const SHOWN = 4;

/**
 * Home › "הוצאה ממתינה לאישור": payments a Shortcut added, shown only while
 * there are some. Nothing here counts in a list or total until Approve. Each
 * shows only what was charged (amount and currency as paid), then Approve
 * (the last split used in this trip), Cancel (to Recently deleted) and Edit.
 */
export function PendingInbox({
  items,
  all,
  onConfirm,
  onEdit,
  onDismiss,
}: {
  items: Expense[];
  /** Every expense of the trip (for the possible-duplicate hint). */
  all: readonly Expense[];
  onConfirm: (e: Expense) => void;
  onEdit: (e: Expense) => void;
  onDismiss: (e: Expense) => void;
}) {
  const c = useColors();
  const { t, lang } = useT();
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  // Keeps a name in another script whole inside a sentence ("7-Eleven", not "Eleven-7")
  const isolate = (s: string) => `⁨${s}⁩`;
  const shown = expanded ? items : items.slice(0, SHOWN);

  const Action = ({ label, primary, onPress }: { label: string; primary?: boolean; onPress: () => void }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={{ flex: 1, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? c.primary : c.cardAlt }}
    >
      <Text variant="caption" color={primary ? c.primaryText : c.text} style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <Card style={{ borderWidth: 1.5, borderColor: c.warning + '88' }}>
      <Row gap={space.sm}>
        <ApplePayMark />
        <Text variant="h2" style={{ flex: 1 }} numberOfLines={1}>
          {t('pending.title')}
        </Text>
        {items.length > 1 ? (
          <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: c.warning, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" color="#fff" style={{ fontWeight: '800' }}>
              {items.length}
            </Text>
          </View>
        ) : null}
      </Row>
      {shown.map((e) => {
        const dup = nearDuplicateOf(e, all);
        return (
          <View key={e.id} style={{ gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border }}>
            <Row gap={space.sm}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: '600' }} numberOfLines={1}>
                  {e.description || e.merchant || t('pending.unnamed')}
                </Text>
                <Text variant="caption" muted numberOfLines={1}>
                  {[new Date(e.occurred_at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), e.notes].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {/* Only what was charged, in the currency it was charged in */}
              <Text variant="mono">{formatMoney(e.amount_minor, e.currency, { lang })}</Text>
            </Row>
            {dup ? (
              <Row gap={4}>
                <Ionicons name="copy-outline" size={13} color={c.warning} />
                <Text variant="caption" color={c.warning} style={{ flex: 1 }} numberOfLines={1}>
                  {t('pending.maybeDuplicate', { name: isolate(dup.description || dup.merchant || '') })}
                </Text>
              </Row>
            ) : null}
            <Row gap={space.xs}>
              <Action label={t('pending.confirm')} primary onPress={() => onConfirm(e)} />
              <Action label={t('pending.dismiss')} onPress={() => onDismiss(e)} />
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.edit')} onPress={() => onEdit(e)} style={{ width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardAlt }}>
                <Ionicons name="create-outline" size={17} color={c.text} />
              </Pressable>
            </Row>
          </View>
        );
      })}
      {items.length > SHOWN ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} style={{ paddingTop: space.sm }}>
          <Text variant="caption" color={c.primary} center style={{ fontWeight: '700' }}>
            {expanded ? t('pending.showLess') : t('pending.showAll', { count: items.length })}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
