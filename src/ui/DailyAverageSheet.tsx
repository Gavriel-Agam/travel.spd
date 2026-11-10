import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useT } from '@/i18n';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney } from '@/lib/money';
import { dayKey, type TripStats } from '@/lib/stats';
import { radius, space, useColors } from '@/theme';
import type { Category, Expense } from '@/types/db';
import { CategoryIcon } from './CategoryIcon';
import { Sheet } from './Sheet';
import { ProgressBar, Row, Text } from './primitives';

/**
 * Home › Daily average, opened: how the figure is worked out (which days,
 * which spending is left out) and what it is made of, per category, with
 * today's spending in each for comparison.
 */
export function DailyAverageSheet({ visible, onClose, stats, expenses, categoryById, timeZone }: {
  visible: boolean;
  onClose: () => void;
  stats: TripStats;
  expenses: Expense[];
  categoryById: Map<string, Category>;
  timeZone: string;
}) {
  const { t, lang } = useT();
  const c = useColors();
  const ils = (m: number) => formatMoney(m, HOME_CURRENCY, { lang });
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  // Today's spending per category, next to its average
  const today = useMemo(() => {
    const key = dayKey(new Date(), timeZone);
    const map = new Map<string | null, number>();
    for (const e of expenses) {
      if (e.kind !== 'expense' || dayKey(e.occurred_at, timeZone) !== key) continue;
      map.set(e.category_id, (map.get(e.category_id) ?? 0) + e.amount_ils_minor);
    }
    return map;
  }, [expenses, timeZone, visible]);

  const range =
    stats.averageFrom && stats.averageTo
      ? stats.averageFrom === stats.averageTo
        ? fmtDay(stats.averageFrom)
        : t('stats.range', { from: fmtDay(stats.averageFrom), to: fmtDay(stats.averageTo) })
      : null;

  return (
    <Sheet visible={visible} onClose={onClose} title={t('home.avgTitle')} height="85%" scroll={false}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
        {/* The figure and how it is worked out */}
        <View style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.md, gap: 4 }}>
          <Text variant="hero" style={{ fontSize: 30 }}>
            {ils(stats.dailyAverage)}
          </Text>
          {stats.daysElapsed ? (
            <Text variant="label">
              {t('home.avgMath', { amount: ils(stats.averagedTotal), count: stats.daysElapsed })}
              {range ? ` · ${range}` : ''}
            </Text>
          ) : (
            <Text variant="label">{t('home.avgNotStarted')}</Text>
          )}
          {stats.preTrip > 0 ? (
            <Text variant="caption" muted>
              {t('home.avgExcludesPre', { amount: ils(stats.preTrip) })}
            </Text>
          ) : null}
          {stats.afterAverage > 0 ? (
            <Text variant="caption" muted>
              {t('home.avgExcludesLater', { amount: ils(stats.afterAverage) })}
            </Text>
          ) : null}
        </View>

        <Text variant="label" muted>
          {t('home.avgByCategory')}
        </Text>
        {stats.averageByCategory.length === 0 ? (
          <Text muted>{t('home.avgEmpty')}</Text>
        ) : (
          stats.averageByCategory.map((row) => {
            const cat = row.categoryId ? categoryById.get(row.categoryId) : undefined;
            const todaySpent = today.get(row.categoryId) ?? 0;
            return (
              <View key={row.categoryId ?? 'none'} style={{ gap: 6 }}>
                <Row gap={space.sm}>
                  <CategoryIcon category={cat} size={18} />
                  <Text style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                    {categoryLabel(cat, t)}
                  </Text>
                  <Text variant="mono">{t('home.perDay', { amount: ils(row.perDay) })}</Text>
                </Row>
                <ProgressBar value={row.pct} color={cat?.color ?? UNCATEGORIZED.color} height={6} />
                <Text variant="caption" muted>
                  {t('home.avgRowTotal', { amount: ils(row.total), pct: row.pct })}
                  {' · '}
                  {t('home.avgRowToday', { amount: ils(todaySpent) })}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </Sheet>
  );
}
