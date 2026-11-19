import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney } from '@/lib/money';
import { nearDuplicateOf } from '@/lib/pendingReview';
import { radius, space, useColors } from '@/theme';
import type { Expense } from '@/types/db';
import { Card, Row, Text, tap } from './primitives';

const SHOWN = 4;

/**
 * Home › Pending review ("ממתין לאישור"): payments a Shortcut added, shown only
 * while there are some. One tap confirms (shared / personal); edit opens the
 * form; ✕ moves it to Recently deleted.
 */
export function PendingInbox({
  items,
  all,
  solo,
  onConfirm,
  onEdit,
  onDismiss,
}: {
  items: Expense[];
  /** Every expense of the trip (for the possible-duplicate hint). */
  all: readonly Expense[];
  solo: boolean;
  onConfirm: (e: Expense, mode: 'shared' | 'personal') => void;
  onEdit: (e: Expense) => void;
  onDismiss: (e: Expense) => void;
}) {
  const c = useColors();
  const { t, lang } = useT();
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
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
        <Ionicons name="hourglass-outline" size={18} color={c.warning} />
        <Text variant="h2" style={{ flex: 1 }}>
          {t('pending.title')}
        </Text>
        <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: c.warning, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="caption" color="#fff" style={{ fontWeight: '800' }}>
            {items.length}
          </Text>
        </View>
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
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="mono">{formatMoney(e.amount_minor, e.currency, { lang })}</Text>
                {e.currency !== HOME_CURRENCY ? (
                  <Text variant="caption" muted>
                    ≈ {formatMoney(e.amount_ils_minor, HOME_CURRENCY, { lang })}
                  </Text>
                ) : null}
              </View>
            </Row>
            {dup ? (
              <Row gap={4}>
                <Ionicons name="copy-outline" size={13} color={c.warning} />
                <Text variant="caption" color={c.warning} style={{ flex: 1 }} numberOfLines={1}>
                  {t('pending.maybeDuplicate', { name: dup.description || dup.merchant || '' })}
                </Text>
              </Row>
            ) : null}
            <Row gap={space.xs}>
              {solo ? (
                <Action label={t('pending.confirm')} primary onPress={() => onConfirm(e, 'personal')} />
              ) : (
                <>
                  <Action label={t('pending.shared')} primary onPress={() => onConfirm(e, 'shared')} />
                  <Action label={t('pending.personal')} onPress={() => onConfirm(e, 'personal')} />
                </>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.edit')} onPress={() => onEdit(e)} style={{ width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardAlt }}>
                <Ionicons name="create-outline" size={17} color={c.text} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('pending.dismiss')} onPress={() => onDismiss(e)} style={{ width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: c.cardAlt }}>
                <Ionicons name="close" size={18} color={c.danger} />
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
