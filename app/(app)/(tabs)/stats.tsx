import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactNode } from 'react';
import { SyncStatus } from '@/ui/SyncStatus';
import { Pressable, RefreshControl, View } from 'react-native';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { byPaymentMethod, dailySeries, sizeDistribution } from '@/lib/budget';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { paymentColor, paymentLabel } from '@/lib/payments';
import { getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, percent } from '@/lib/money';
import { byCategoryBetween, dayKey, periodRange, spendByCurrency, type Period } from '@/lib/stats';
import { space, useColors } from '@/theme';
import { BarChart, DonutChart, LegendRow } from '@/ui/charts';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { CurrencySheet } from '@/ui/CurrencySheet';
import { DraggableGrid } from '@/ui/DraggableGrid';
import { useCardOrder, useDragScroll } from '@/hooks/useCardOrder';
import { DateField } from '@/ui/DateField';
import { Avatar, Card, EmptyState, ErrorView, IconButton, Loading, ScreenSkeleton, OfflineNoData, ProgressBar, Row, Screen, SectionHeader, Segmented, Text } from '@/ui/primitives';

// The "budget vs actual" card was removed (2026-11-12): the trip budget lives in Settings › Trip details and on Home
const STATS_SECTIONS = ['summary', 'categories', 'byDay', 'topDays', 'partners', 'payment', 'distribution', 'currency'] as const;
type StatsSection = (typeof STATS_SECTIONS)[number];

const NO_PAYMENT_COLOR = '#A3A7B9';

/** Time range of the category pie: the whole trip, a day / week / month, or chosen dates. */
type PieRange = 'all' | Period | 'custom';

/** A Date picked in a date field as a "YYYY-MM-DD" key (its own calendar day). */
function localDayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Stats() {
  const { t, lang } = useT();
  const c = useColors();
  const data = useTripData();
  const { trip, stats, expenses, categoryById, memberById, balances, isLoading } = data;
  const [selCategory, setSelCategory] = useState<string | null>(null);
  const [selPayment, setSelPayment] = useState<string | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [pieRange, setPieRange] = useState<PieRange>('all');
  // Day / week / month: how many periods back (negative) from the current one
  const [pieOffset, setPieOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 6 * 86_400_000));
  const [customTo, setCustomTo] = useState(() => new Date());
  const layout = useCardOrder('stats', STATS_SECTIONS);
  // The currency breakdown: null = closed, '' = open with nothing expanded, a code = that currency opened
  const [currencyOpen, setCurrencyOpen] = useState<string | null>(null);
  const drag = useDragScroll();
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
  if (data.offlineEmpty) return <OfflineNoData onRetry={data.refetch} />;
  if (isLoading || !stats) return <ScreenSkeleton />;
  if (data.error)
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <ErrorView error={data.error} onRetry={data.refetch} />
      </Screen>
    );

  const spendingCount = expenses.filter((e) => e.kind === 'expense').length;
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(d + 'T12:00:00Z').toLocaleDateString(locale, { ...opts, timeZone: 'UTC' });

  // Category pie: the whole trip or the chosen range
  const todayKey = dayKey(new Date(), trip.timezone);
  const span =
    pieRange === 'all'
      ? null
      : pieRange === 'custom'
        ? (() => {
            const a = localDayKey(customFrom);
            const b = localDayKey(customTo);
            return a <= b ? { from: a, to: b } : { from: b, to: a };
          })()
        : periodRange(pieRange, todayKey, pieOffset, lang === 'he' ? 0 : 1);
  const pie = span ? byCategoryBetween(expenses, trip.timezone, span.from, span.to) : { total: stats.total, rows: stats.byCategory };
  // Stepping forward stops at the current period (or the trip's last day, if later)
  const lastStep = trip.end_date && trip.end_date > todayKey ? trip.end_date : todayKey;
  const shortDay = (d: string) => fmtDay(d, { day: 'numeric', month: 'short' });
  const spanLabel = !span
    ? null
    : pieRange === 'day'
      ? fmtDay(span.from, { weekday: 'short', day: 'numeric', month: 'short' })
      : pieRange === 'month'
        ? fmtDay(span.from, { month: 'long', year: 'numeric' })
        : t('stats.range', { from: shortDay(span.from), to: shortDay(span.to) });
  const choosePieRange = (r: PieRange) => {
    setPieRange(r);
    setPieOffset(0);
    setSelCategory(null);
  };
  const stepPie = (delta: number) => {
    setPieOffset((o) => o + delta);
    setSelCategory(null);
  };

  const slices = pie.rows.map((row) => {
    const cat = row.categoryId ? categoryById.get(row.categoryId) : undefined;
    return { key: row.categoryId ?? 'none', value: row.total, color: cat?.color ?? UNCATEGORIZED.color, row, cat };
  });
  const sel = slices.find((s) => s.key === selCategory);
  const selDayRow = series.find((d) => d.day === selDay);
  const payments = byPaymentMethod(expenses);
  const selPay = payments.find((p) => p.key === selPayment);
  const sizes = sizeDistribution(expenses);
  const maxSizeCount = Math.max(1, ...sizes.map((s) => s.count));

  // Cards in the order chosen on this device (hold a card to move it)
  const sections: Record<StatsSection, ReactNode> = {
    summary: (
      <View style={{ gap: space.md }}>
          <Row gap={space.md} align="stretch">
            <Summary label={t('home.spent')} value={ils(stats.total)} />
            <Summary label={t('home.dailyAvg')} value={ils(stats.dailyAverage)} />
          </Row>
          <Row gap={space.md} align="stretch">
            <Summary label={t('stats.days')} value={String(stats.daysElapsed)} />
            <Summary label={t('stats.count')} value={String(spendingCount)} />
          </Row>

      </View>
    ),
    categories: (
          <Card>
            <SectionHeader title={t('home.byCategory')} />
            {/* Time range: whole trip, day, week, month or chosen dates */}
            <Segmented<PieRange>
              options={[
                { value: 'all', label: t('stats.rangeAll') },
                { value: 'day', label: t('stats.rangeDay') },
                { value: 'week', label: t('stats.rangeWeek') },
                { value: 'month', label: t('stats.rangeMonth') },
                { value: 'custom', label: t('stats.rangeCustom') },
              ]}
              value={pieRange}
              onChange={choosePieRange}
            />
            {span && pieRange !== 'custom' ? (
              // Previous / next period ("back" points to the start side: right in Hebrew)
              <Row style={{ justifyContent: 'space-between' }}>
                <IconButton name={lang === 'he' ? 'chevron-forward' : 'chevron-back'} onPress={() => stepPie(-1)} label={t('stats.rangePrev')} />
                <Text variant="label">{spanLabel}</Text>
                <View style={{ opacity: span.to >= lastStep ? 0.3 : 1 }}>
                  <IconButton
                    name={lang === 'he' ? 'chevron-back' : 'chevron-forward'}
                    onPress={() => {
                      if (span.to < lastStep) stepPie(1);
                    }}
                    label={t('stats.rangeNext')}
                  />
                </View>
              </Row>
            ) : null}
            {pieRange === 'custom' ? (
              <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }} gap={space.sm}>
                <Row gap={space.sm}>
                  <Text variant="label" muted>
                    {t('stats.rangeFrom')}
                  </Text>
                  <DateField
                    value={customFrom}
                    onChange={(d) => {
                      setCustomFrom(d);
                      setSelCategory(null);
                    }}
                  />
                </Row>
                <Row gap={space.sm}>
                  <Text variant="label" muted>
                    {t('stats.rangeTo')}
                  </Text>
                  <DateField
                    value={customTo}
                    minimumDate={customFrom}
                    onChange={(d) => {
                      setCustomTo(d);
                      setSelCategory(null);
                    }}
                  />
                </Row>
              </Row>
            ) : null}
            {pie.total === 0 ? (
              <Text muted center style={{ paddingVertical: space.xl }}>
                {t('stats.rangeEmpty')}
              </Text>
            ) : (
              <>
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
                    {ils(sel ? sel.value : pie.total)}
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
                  icon={<CategoryIcon category={s.cat} size={15} />}
                  label={categoryLabel(s.cat, t)}
                  value={ils(s.value)}
                  pct={s.row.pct}
                  selected={selCategory === s.key}
                  onPress={() => setSelCategory(selCategory === s.key ? null : s.key)}
                />
              ))}
            </View>
              </>
            )}
          </Card>

    ),
    byDay: (
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

    ),
    topDays: (
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

    ),
    partners: balances.length > 1 ? (
            <Card>
              <SectionHeader title={t('stats.byPartner')} />
              {balances.map((b) => {
                const m = memberById.get(b.memberId);
                if (!m) return null;
                return (
                  <View key={b.memberId} style={{ gap: 6 }}>
                    <Row gap={space.sm}>
                      <Avatar name={m.display_name} color={m.color} photoPath={m.photo_path} size={26} />
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
          ) : null,
    payment: (
          <Card>
            <SectionHeader title={t('stats.byPayment')} />
            <DonutChart
              data={payments.map((p) => ({ key: p.key, value: p.total, color: paymentColor(p.key, NO_PAYMENT_COLOR) }))}
              size={170}
              thickness={22}
              selected={selPayment}
              onSelect={setSelPayment}
              center={
                <>
                  <Text variant="caption" muted center numberOfLines={1}>
                    {selPay ? paymentLabel(selPay.key, t) : t('stats.total')}
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
                  color={paymentColor(p.key, NO_PAYMENT_COLOR)}
                  label={paymentLabel(p.key, t)}
                  value={ils(p.total)}
                  pct={p.pct}
                  selected={selPayment === p.key}
                  onPress={() => setSelPayment(selPayment === p.key ? null : p.key)}
                />
              ))}
            </View>
          </Card>

    ),
    distribution: (
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

    ),
    currency: (
          <Card>
            <SectionHeader title={t('stats.byCurrency')} action={t('stats.currencyDetails')} onAction={() => setCurrencyOpen('')} />
            {spendByCurrency(expenses).map((row) => {
              const cur = getCurrency(row.currency);
              return (
                // Tap a currency: its totals and expenses in the breakdown sheet
                <Pressable
                  key={row.currency}
                  accessibilityRole="button"
                  accessibilityLabel={`${cur.code} · ${t('stats.currencyDetails')}`}
                  onPress={() => setCurrencyOpen(row.currency)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                <Row gap={12}>
                  <Text style={{ fontSize: 22 }}>{cur.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600' }}>{formatMoney(row.originalMinor, row.currency, { lang })}</Text>
                    <Text variant="caption" muted>
                      {t('stats.expensesCount', { count: row.count })}
                    </Text>
                  </View>
                  {/* Shekel rows would show the same amount twice */}
                  {row.currency !== HOME_CURRENCY ? <Text variant="mono">{ils(row.ilsMinor)}</Text> : null}
                  <Ionicons name={lang === 'he' ? 'chevron-back' : 'chevron-forward'} size={14} color={c.textFaint} />
                </Row>
                </Pressable>
              );
            })}
          </Card>
    ),
  };

  return (
    <Screen {...drag.scrollProps} refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} />}>
      <Text variant="title">{t('stats.title')}</Text>
      <SyncStatus tripId={trip.id} />

      {spendingCount === 0 ? (
        <Card>
          <EmptyState emoji="📊" title={t('home.emptyTitle')} body={t('home.emptyBody')} />
        </Card>
      ) : (
        <DraggableGrid
          items={layout.order.filter((k) => sections[k]).map((k) => ({ key: k, node: sections[k] }))}
          onReorder={layout.onReorder}
          scrollRef={drag.scrollRef}
          scroll={drag.scroll}
          onDragging={drag.setDragging}
        />
      )}
      <CurrencySheet
        visible={currencyOpen !== null}
        open={currencyOpen || null}
        onClose={() => setCurrencyOpen(null)}
        expenses={expenses}
        categoryById={categoryById}
        timeZone={trip.timezone}
      />
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
