import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useInviteCode } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { HOME_CURRENCY } from '@/lib/currencies';
import { resolveHomeOrder, type HomeSection } from '@/lib/homeLayout';
import { formatMoney, percent } from '@/lib/money';
import { daysInclusive, dayKey, lastNDays } from '@/lib/stats';
import { readableOn } from '@/lib/contrast';
import { alertColor, radius, space, useColors } from '@/theme';
import { BudgetAlertBanner } from '@/ui/BudgetAlert';
import { Sheet } from '@/ui/Sheet';
import { SortableList } from '@/ui/SortableList';
import { SyncStatus } from '@/ui/SyncStatus';
import { usePrefs } from '@/store/prefs';
import { ExpenseRow } from '@/ui/ExpenseRow';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorView,
  Loading,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/ui/primitives';

const SECTION_ICONS: Record<HomeSection, string> = { hero: '💰', today: '📅', couple: '👫', trend: '📊', categories: '🏷️', recent: '🧾' };

export default function Home() {
  const { t, lang } = useT();
  const c = useColors();
  // Text on the total card follows the card colour (white on dark, ink on light)
  const onHero = readableOn(c.heroFrom);
  const data = useTripData();
  const { trip, stats, members, expenses, balances, transfers, memberById, categoryById } = data;
  // Invite codes only apply to regular trips; in the shared MVP trip everyone joins with Start
  const invite = useInviteCode(members.length < 2 && !trip?.shared ? trip?.id : undefined);
  const ils = (m: number) => formatMoney(m, HOME_CURRENCY, { lang });
  const savedOrder = usePrefs((s) => s.homeOrder);
  const setHomeOrder = usePrefs((s) => s.setHomeOrder);
  const order = useMemo(() => resolveHomeOrder(savedOrder), [savedOrder]);
  const [arranging, setArranging] = useState(false);

  const trend = useMemo(() => {
    if (!trip || !stats) return [];
    const map = new Map(stats.byDay.map((d) => [d.day, d.total]));
    return lastNDays(7, new Date(), trip.timezone).map((day) => ({ day, total: map.get(day) ?? 0 }));
  }, [trip, stats]);

  if (!trip) return null;
  if (data.isLoading) return <Loading />;
  if (data.error)
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <ErrorView error={data.error} onRetry={data.refetch} />
      </Screen>
    );
  if (!stats) return null;

  const today = dayKey(new Date(), trip.timezone);
  const dayN = trip.start_date && trip.start_date <= today ? daysInclusive(trip.start_date, today) : null;
  const maxTrend = Math.max(1, ...trend.map((d) => d.total));
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const notStarted = !!trip.start_date && today < trip.start_date;

  // Cards in the order chosen on this phone (Arrange)
  const hasData = expenses.length > 0;
  const sections: Record<HomeSection, ReactNode> = {
    hero: (
      <View style={{ backgroundColor: c.heroFrom, borderRadius: radius.xl, padding: space.xl, gap: space.md, overflow: 'hidden' }}>
        {/* Decoration only: its own layer under the text, never on top of it */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, zIndex: 0 }}>
          <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: c.heroTo, opacity: 0.55, top: -90, end: -80 }} />
        </View>
        <View style={{ gap: space.md, zIndex: 1 }}>
          <Text variant="label" color={onHero}>
            {t('home.spent')}
          </Text>
          <Text variant="hero" color={onHero}>
            {ils(stats.total)}
          </Text>
          {stats.budget ? (
            <>
              <ProgressBar value={stats.pctUsed} color={onHero} track={onHero + '40'} height={10} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label" color={onHero}>
                  {stats.pctUsed}% · {t('home.of', { amount: ils(stats.budget) })}
                </Text>
                <Text variant="label" color={onHero} style={{ fontWeight: '700' }}>
                  {stats.remaining! >= 0 ? t('home.remaining', { amount: ils(stats.remaining!) }) : t('home.over', { amount: ils(-stats.remaining!) })}
                </Text>
              </Row>
            </>
          ) : (
            <Text variant="label" color={onHero}>
              {t('home.noBudget')}
            </Text>
          )}
        </View>
      </View>
    ),
    today: (
      <Row gap={space.md} align="stretch">
        <Card style={{ flex: 1, gap: 6 }}>
          <Text variant="label" muted>
            {t('home.today')}
          </Text>
          <Text variant="h2" style={{ fontSize: 20 }}>
            {ils(stats.today)}
          </Text>
          {stats.dailyBudget ? (
            <>
              <ProgressBar value={stats.todayPct} color={alertColor(c, stats.todayPct)} height={6} />
              <Text variant="caption" muted>
                {t('home.dailyLimit')}: {ils(stats.dailyBudget)}
              </Text>
            </>
          ) : null}
        </Card>
        <Card style={{ flex: 1, gap: 6 }}>
          <Text variant="label" muted>
            {t('home.dailyAvg')}
          </Text>
          <Text variant="h2" style={{ fontSize: 20 }}>
            {ils(stats.dailyAverage)}
          </Text>
          {stats.projected != null ? (
            <Text variant="caption" muted>
              {t('home.projected')}: {ils(stats.projected)}
            </Text>
          ) : null}
        </Card>
      </Row>
    ),
    couple:
      members.length > 1 ? (
        <Card>
          <SectionHeader title={t('home.couple')} />
          {balances.map((b) => {
            const m = memberById.get(b.memberId);
            if (!m) return null;
            return (
              <View key={b.memberId} style={{ gap: 6 }}>
                <Row gap={space.md}>
                  <Avatar name={m.display_name} color={m.color} />
                  <Text style={{ flex: 1, fontWeight: '600' }}>{m.display_name}</Text>
                  <Text variant="mono">{ils(b.paid)}</Text>
                </Row>
                <ProgressBar value={percent(b.paid, stats.total)} color={m.color} height={6} />
                <Text variant="caption" muted>
                  {t('home.share')}: {ils(b.share)}
                </Text>
              </View>
            );
          })}
          <View style={{ backgroundColor: c.cardAlt, borderRadius: radius.md, padding: space.md }}>
            {transfers.length === 0 ? (
              <Text variant="label" center>
                ✅ {t('home.settled')}
              </Text>
            ) : (
              transfers.map((tr) => (
                <Row key={tr.from + tr.to} style={{ justifyContent: 'space-between' }}>
                  <Text variant="label">
                    {t('home.owes', { from: memberById.get(tr.from)?.display_name, to: memberById.get(tr.to)?.display_name })}
                  </Text>
                  <Text variant="mono" color={c.primary}>
                    {ils(tr.amount)}
                  </Text>
                </Row>
              ))
            )}
          </View>
          <Button title={t('settle.open')} variant="secondary" icon="swap-horizontal" onPress={() => router.push('/settle')} />
        </Card>
      ) : null,
    trend: hasData ? (
      <Card>
        <SectionHeader title={t('home.trend')} />
        <Row align="flex-end" gap={8} style={{ height: 120 }}>
          {trend.map((d) => {
            const isToday = d.day === today;
            const h = Math.max(4, (d.total / maxTrend) * 96);
            const over = stats.dailyBudget != null && d.total > stats.dailyBudget;
            return (
              <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: '70%',
                    height: h,
                    borderRadius: 6,
                    backgroundColor: over ? c.danger : isToday ? c.primary : c.primary + '55',
                  }}
                />
                <Text variant="caption" color={isToday ? c.text : c.textFaint} style={{ fontSize: 10 }}>
                  {new Date(d.day + 'T12:00:00Z').toLocaleDateString(locale, { weekday: 'narrow', timeZone: 'UTC' })}
                </Text>
              </View>
            );
          })}
        </Row>
      </Card>
    ) : null,
    categories: hasData ? (
      <Card>
        <SectionHeader title={t('home.byCategory')} />
        {stats.byCategory.slice(0, 5).map((row) => {
          const cat = row.categoryId ? categoryById.get(row.categoryId) : undefined;
          const color = cat?.color ?? UNCATEGORIZED.color;
          return (
            <View key={row.categoryId ?? 'none'} style={{ gap: 6 }}>
              <Row>
                <Text>{cat?.icon ?? UNCATEGORIZED.icon}</Text>
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {categoryLabel(cat, t)}
                </Text>
                <Text variant="caption" muted>
                  {row.pct}%
                </Text>
                <Text variant="mono" style={{ minWidth: 80, textAlign: 'right' }}>
                  {ils(row.total)}
                </Text>
              </Row>
              <ProgressBar value={row.pct} color={color} height={6} />
            </View>
          );
        })}
      </Card>
    ) : null,
    recent: hasData ? (
      <Card style={{ gap: 0 }}>
        <SectionHeader title={t('home.recent')} action={t('home.seeAll')} onAction={() => router.push('/expenses')} />
        {expenses.slice(0, 5).map((e) => (
          <ExpenseRow
            key={e.id}
            expense={e}
            category={e.category_id ? categoryById.get(e.category_id) : undefined}
            payer={memberById.get(e.paid_by_member_id)}
          recipient={memberById.get(e.expense_splits[0]?.member_id)}
            onPress={() => router.push({ pathname: '/expense/[id]', params: { id: e.id } })}
          />
        ))}
      </Card>
    ) : null,
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} />}>
      <Row style={{ justifyContent: 'space-between' }} align="flex-end">
        <View style={{ gap: 2, flex: 1 }}>
          <Text variant="caption" muted>
            {dayN && (!trip.end_date || today <= trip.end_date)
              ? t('home.dayN', { n: dayN })
              : notStarted
                ? t('home.startsOn', { date: new Date(trip.start_date + 'T12:00:00Z').toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }) })
                : ' '}
          </Text>
          <Text variant="title" numberOfLines={1}>
            {trip.name}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setArranging(true)}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }}
        >
          <Ionicons name="swap-vertical" size={18} color={c.primary} />
          <Text variant="label" color={c.primary}>
            {t('home.arrange')}
          </Text>
        </Pressable>
      </Row>

      <SyncStatus tripId={trip.id} />
      <BudgetAlertBanner status={data.topAlert} categories={categoryById} members={memberById} />

      {/* Invite prompt until the partner joins */}
      {members.length < 2 && !trip.shared && invite.data ? (
        <Card style={{ backgroundColor: c.primarySoft }}>
          <Text variant="h2">{t('home.invitePartner')}</Text>
          <Text muted>{t('home.invitePartnerBody', { code: invite.data })}</Text>
          <Button
            title={invite.data}
            icon="copy-outline"
            variant="secondary"
            onPress={() => Clipboard.setStringAsync(invite.data!)}
            style={{ backgroundColor: c.card }}
          />
        </Card>
      ) : null}

      {order.map((key) => (sections[key] ? <Fragment key={key}>{sections[key]}</Fragment> : null))}

      {!hasData ? (
        <Card>
          <EmptyState emoji="🧾" title={t('home.emptyTitle')} body={t('home.emptyBody')} />
        </Card>
      ) : null}

      <Sheet visible={arranging} onClose={() => setArranging(false)} title={t('home.arrangeTitle')}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Text variant="caption" muted center>
            {t('home.arrangeHint')}
          </Text>
          <SortableList
            items={order.map((k) => ({ key: k, label: t(`home.sections.${k}`), icon: SECTION_ICONS[k] }))}
            onChange={(keys) => setHomeOrder(keys)}
          />
          <Button title={t('common.done')} onPress={() => setArranging(false)} />
          <Button title={t('home.arrangeReset')} variant="ghost" icon="refresh" onPress={() => setHomeOrder(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}
