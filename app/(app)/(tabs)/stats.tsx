import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { byPaymentMethod, dailySeries, sizeDistribution } from '@/lib/budget';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, percent } from '@/lib/money';
import { dayKey, spendByCurrency } from '@/lib/stats';
import { alertColor, space, useColors } from '@/theme';
import { BarChart, DonutChart, LegendRow, PaceChart } from '@/ui/charts';
import { Avatar, Card, Dot, EmptyState, ErrorView, Loading, ProgressBar, Row, Screen, SectionHeader, Text } from '@/ui/primitives';

const PAYMENT_COLORS: Record<string, string> = { cash: '#22C55E', card: '#3366FF', transfer: '#7A5AF8', other: '#F79009', unknown: '#A3A7B9' };

export default function Stats() {
  const { t, lang } = useT();
  const c = useColors();
  const data = useTripData();
  const { trip, stats, expenses, categoryById, memberById, balances, budgetStatuses, isLoading } = data;
  const [selCategory, setSelCategory] = useState<string | null>(null);
  const [selPayment, setSelPayment] = useState<string | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const ils = (m: number) => formatMoney(m, HOME_CURRENCY, { lang });
  const ilsShort = (m: number) => formatMoney(m, HOME_CURRENCY, { lang, compact: true });
  const locale = lang === 'he' ? 'he-IL' : 'en-US';

  const series = useMemo(
    () =>
      trip && stats
        ? dailySeries({ expenses, timeZone: trip.timezone, now: new Date(), startDate: trip.start_date, endDate: trip.end_date, totalBudget: stats.budget })
        : [],
    [trip, stats, expenses],
  );

  if (!trip) return null;
  if (isLoading || !stats) return <Loading />;
  if (data.error)
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <ErrorView error={data.error} onRetry={data.refetch} />
      </Screen>
    );

  const spendingCount = expenses.filter((e) => e.kind === 'expense').length;
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00Z').toLocaleDateString(locale, { ...opts, timeZone: 'UTC' });

  const slices = stats.byCategory.map((row) => {
    const cat = row.categoryId ? categoryById.get(row.categoryId) : undefined;
    return { key: row.categoryId ?? 'none', value: row.total, color: cat?.color ?? UNCATEGORIZED.color, row, cat };
  });
  const sel = slices.find((s) => s.key === selCategory);
  const selDayRow = series.find((d) => d.day === selDay);
  const last = series[series.length - 1];
  const notStarted = !!trip.start_date && dayKey(new Date(), trip.timezone) < trip.start_date;
  const payments = byPaymentMethod(expenses);
  const selPay = payments.find((p) => p.key === selPayment);
  const sizes = sizeDistribution(expenses);
  const maxSizeCount = Math.max(1, ...sizes.map((s) => s.count));
  const categoryBudgets = budgetStatuses.filter((s) => s.scope === 'category');

  return (
    <Screen refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} />}>
      <Text variant="title">{t('stats.title')}</Text>

      {spendingCount === 0 ? (
        <Card>
          <EmptyState emoji="📊" title={t('home.emptyTitle')} body={t('home.emptyBody')} />
        </Card>
      ) : (
        <>
          {/* Summary */}
          <Row gap={space.md} align="stretch">
            <Summary label={t('home.spent')} value={ils(stats.total)} />
            <Summary label={t('home.dailyAvg')} value={ils(stats.dailyAverage)} />
          </Row>
          <Row gap={space.md} align="stretch">
            <Summary label={t('stats.days')} value={String(stats.daysElapsed)} />
            <Summary label={t('stats.count')} value={String(spendingCount)} />
          </Row>

          {/* Categories */}
          <Card>
            <SectionHeader title={t('home.byCategory')} />
            <DonutChart
              data={slices}
              selected={selCategory}
              onSelect={setSelCategory}
              center={
                <>
                  <Text variant="caption" muted center numberOfLines={1}>
                    {sel ? categoryLabel(sel.cat, t) : t('stats.total')}
                  </Text>
                  <Text variant="h2" center numberOfLines={1} adjustsFontSizeToFit>
                    {ils(sel ? sel.value : stats.total)}
                  </Text>
                  {sel ? (
                    <Text variant="caption" muted center>
                      {sel.row.pct}%
                    </Text>
                  ) : null}
                </>
              }
            />
            <View>
              {slices.map((s) => (
                <LegendRow
                  key={s.key}
                  color={s.color}
                  label={`${s.cat?.icon ?? UNCATEGORIZED.icon}  ${categoryLabel(s.cat, t)}`}
                  value={ils(s.value)}
                  pct={s.row.pct}
                  selected={selCategory === s.key}
                  onPress={() => setSelCategory(selCategory === s.key ? null : s.key)}
                />
              ))}
            </View>
          </Card>

          {/* By day */}
          <Card>
            <SectionHeader title={t('stats.byDay')} />
            <BarChart
              data={series.map((d) => ({ key: d.day, label: fmtDay(d.day, { day: 'numeric', month: 'numeric' }), value: d.total }))}
              selected={selDay}
              onSelect={setSelDay}
              limit={stats.dailyBudget}
              formatValue={ilsShort}
            />
            <Text variant="caption" muted center>
              {selDayRow
                ? `${fmtDay(selDayRow.day, { weekday: 'long', day: 'numeric', month: 'long' })}: ${ils(selDayRow.total)}`
                : stats.dailyBudget
                  ? t('stats.dashedDaily', { amount: ils(stats.dailyBudget) })
                  : t('stats.tapBar')}
            </Text>
          </Card>

          {/* Most expensive days */}
          <Card>
            <SectionHeader title={t('stats.topDays')} />
            {stats.topDays.map((d, i) => (
              <Row key={d.day} style={{ justifyContent: 'space-between' }}>
                <Text>
                  {['🥇', '🥈', '🥉'][i]} {fmtDay(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                <Text variant="mono">{ils(d.total)}</Text>
              </Row>
            ))}
          </Card>

          {/* Budget vs actual */}
          {stats.budget ? (
            <Card>
              <SectionHeader title={t('stats.budgetVsActual')} />
              {series.some((p) => p.pace != null) ? (
                <>
                  <PaceChart points={series} />
                  <Row gap={space.lg}>
                    <Row gap={6}>
                      <Dot color={c.primary} />
                      <Text variant="caption" muted>
                        {t('stats.actual')}
                      </Text>
                    </Row>
                    <Row gap={6}>
                      <Dot color={c.textFaint} />
                      <Text variant="caption" muted>
                        {t('stats.plannedPace')}
                      </Text>
                    </Row>
                  </Row>
                  {notStarted ? (
                    <Text variant="caption" muted>
                      {t('budget.notStarted', { date: fmtDay(trip.start_date!, { day: 'numeric', month: 'long' }), amount: ils(stats.total) })}
                    </Text>
                  ) : last?.pace != null ? (
                    <Text variant="caption" muted>
                      {t('stats.paceSoFar', { actual: ils(last.cumulative), planned: ils(last.pace) })}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text variant="caption" muted>
                  {t('budget.projectionNeedsDates')}
                </Text>
              )}
              {categoryBudgets.map((s) => {
                const cat = categoryById.get(s.key);
                return (
                  <View key={s.key} style={{ gap: 4 }}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text variant="label">
                        {cat?.icon} {categoryLabel(cat, t)}
                      </Text>
                      <Text variant="caption" muted>
                        {ils(s.spent)} / {ils(s.limit)}
                      </Text>
                    </Row>
                    <ProgressBar value={s.pct} color={alertColor(c, s.alert)} height={6} />
                  </View>
                );
              })}
            </Card>
          ) : null}

          {/* By partner */}
          {balances.length > 1 ? (
            <Card>
              <SectionHeader title={t('stats.byPartner')} />
              {balances.map((b) => {
                const m = memberById.get(b.memberId);
                if (!m) return null;
                return (
                  <View key={b.memberId} style={{ gap: 6 }}>
                    <Row gap={space.sm}>
                      <Avatar name={m.display_name} color={m.color} size={26} />
                      <Text style={{ flex: 1, fontWeight: '600' }}>{m.display_name}</Text>
                    </Row>
                    <Row gap={space.sm}>
                      <Text variant="caption" muted style={{ width: 60 }}>
                        {t('settle.paid')}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <ProgressBar value={percent(b.paid, stats.total)} color={m.color} height={8} />
                      </View>
                      <Text variant="caption" style={{ minWidth: 70, textAlign: 'right' }}>
                        {ils(b.paid)}
                      </Text>
                    </Row>
                    <Row gap={space.sm}>
                      <Text variant="caption" muted style={{ width: 60 }}>
                        {t('settle.share')}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <ProgressBar value={percent(b.share, stats.total)} color={m.color + '88'} height={8} />
                      </View>
                      <Text variant="caption" style={{ minWidth: 70, textAlign: 'right' }}>
                        {ils(b.share)}
                      </Text>
                    </Row>
                  </View>
                );
              })}
            </Card>
          ) : null}

          {/* Payment method */}
          <Card>
            <SectionHeader title={t('stats.byPayment')} />
            <DonutChart
              data={payments.map((p) => ({ key: p.key, value: p.total, color: PAYMENT_COLORS[p.key] ?? c.textFaint }))}
              size={170}
              thickness={22}
              selected={selPayment}
              onSelect={setSelPayment}
              center={
                <>
                  <Text variant="caption" muted center numberOfLines={1}>
                    {selPay ? t(`payment.${selPay.key}`) : t('stats.total')}
                  </Text>
                  <Text variant="h2" center numberOfLines={1} adjustsFontSizeToFit>
                    {ils(selPay ? selPay.total : stats.total)}
                  </Text>
                  {selPay ? (
                    <Text variant="caption" muted center>
                      {selPay.pct}%
                    </Text>
                  ) : null}
                </>
              }
            />
            <View>
              {payments.map((p) => (
                <LegendRow
                  key={p.key}
                  color={PAYMENT_COLORS[p.key] ?? c.textFaint}
                  label={t(`payment.${p.key}`)}
                  value={ils(p.total)}
                  pct={p.pct}
                  selected={selPayment === p.key}
                  onPress={() => setSelPayment(selPayment === p.key ? null : p.key)}
                />
              ))}
            </View>
          </Card>

          {/* Distribution */}
          <Card>
            <SectionHeader title={t('stats.distribution')} />
            {sizes.map((s) => (
              <Row key={s.from} gap={space.sm}>
                <Text variant="caption" muted style={{ width: 96 }}>
                  {s.to == null ? t('stats.rangeOver', { from: ilsShort(s.from) }) : t('stats.range', { from: ilsShort(s.from), to: ilsShort(s.to) })}
                </Text>
                <View style={{ flex: 1 }}>
                  <ProgressBar value={(s.count / maxSizeCount) * 100} height={8} />
                </View>
                <Text variant="caption" style={{ width: 28, textAlign: 'right' }}>
                  {s.count}
                </Text>
              </Row>
            ))}
          </Card>

          {/* By currency */}
          <Card>
            <SectionHeader title={t('stats.byCurrency')} />
            {spendByCurrency(expenses).map((row) => {
              const cur = getCurrency(row.currency);
              return (
                <Row key={row.currency} gap={12}>
                  <Text style={{ fontSize: 22 }}>{cur.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600' }}>{formatMoney(row.originalMinor, row.currency, { lang })}</Text>
                    <Text variant="caption" muted>
                      {t('stats.expensesCount', { count: row.count })}
                    </Text>
                  </View>
                  {/* Shekel rows would show the same amount twice */}
                  {row.currency !== HOME_CURRENCY ? <Text variant="mono">{ils(row.ilsMinor)}</Text> : null}
                </Row>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, gap: 4 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="h2" style={{ fontSize: 20 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </Card>
  );
}
