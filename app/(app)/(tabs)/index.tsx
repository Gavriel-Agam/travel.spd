import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { useInviteCode } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, percent } from '@/lib/money';
import { daysInclusive, dayKey, lastNDays } from '@/lib/stats';
import { alertColor, radius, space, useColors } from '@/theme';
import { BudgetAlertBanner } from '@/ui/BudgetAlert';
import { SyncStatus } from '@/ui/SyncStatus';
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

export default function Home() {
  const { t, lang } = useT();
  const c = useColors();
  const data = useTripData();
  const { trip, stats, members, expenses, balances, transfers, memberById, categoryById } = data;
  // Invite codes only apply to regular trips; in the shared MVP trip everyone joins with Start
  const invite = useInviteCode(members.length < 2 && !trip?.shared ? trip?.id : undefined);
  const ils = (m: number) => formatMoney(m, HOME_CURRENCY, { lang });

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

  return (
    <Screen refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} />}>
      <View style={{ gap: 2 }}>
        <Text variant="caption" muted>
          {dayN && (!trip.end_date || today <= trip.end_date) ? t('home.dayN', { n: dayN }) : ' '}
        </Text>
        <Text variant="title" numberOfLines={1}>
          {trip.name}
        </Text>
      </View>

      {/* Budget hero */}
      <View style={{ backgroundColor: c.heroFrom, borderRadius: radius.xl, padding: space.xl, gap: space.md, overflow: 'hidden' }}>
        <View
          style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: c.heroTo, opacity: 0.55, top: -90, end: -80 }}
        />
        <Text variant="label" color="rgba(255,255,255,0.8)">
          {t('home.spent')}
        </Text>
        <Text variant="hero" color="#fff">
          {ils(stats.total)}
        </Text>
        {stats.budget ? (
          <>
            <ProgressBar value={stats.pctUsed} color="#fff" track="rgba(255,255,255,0.25)" height={10} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="label" color="rgba(255,255,255,0.85)">
                {stats.pctUsed}% · {t('home.of', { amount: ils(stats.budget) })}
              </Text>
              <Text variant="label" color="#fff">
                {stats.remaining! >= 0 ? t('home.remaining', { amount: ils(stats.remaining!) }) : t('home.over', { amount: ils(-stats.remaining!) })}
              </Text>
            </Row>
          </>
        ) : (
          <Text variant="label" color="rgba(255,255,255,0.8)">
            {t('home.noBudget')}
          </Text>
        )}
      </View>

      <SyncStatus tripId={trip.id} />
      <BudgetAlertBanner status={data.topAlert} categories={categoryById} members={memberById} />

      {/* Today / average */}
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

      {/* Couple overview */}
      {members.length > 1 ? (
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
      ) : null}

      {expenses.length === 0 ? (
        <Card>
          <EmptyState emoji="🧾" title={t('home.emptyTitle')} body={t('home.emptyBody')} />
        </Card>
      ) : (
        <>
          {/* Last 7 days */}
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

          {/* Categories */}
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

          {/* Recent */}
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
        </>
      )}
    </Screen>
  );
}
