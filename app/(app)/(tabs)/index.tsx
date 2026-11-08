import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, RefreshControl, View, type ScrollViewInstance } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { HERO_GLOW_OPACITY } from '@/palette';
import { useHomeLayout, useInviteCode } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { HOME_CURRENCY } from '@/lib/currencies';
import { mergeVisibleOrder, resolveHomeOrder, type HomeSection } from '@/lib/homeLayout';
import { formatMoney, percent } from '@/lib/money';
import { daysInclusive, dayKey, lastNDays } from '@/lib/stats';
import { readableOn } from '@/lib/contrast';
import { alertColor, radius, space, useColors } from '@/theme';
import { BudgetAlertBanner } from '@/ui/BudgetAlert';
import { Sheet } from '@/ui/Sheet';
import { SortableList } from '@/ui/SortableList';
import { SyncStatus } from '@/ui/SyncStatus';
import { useAuth } from '@/providers/AuthProvider';
import { useTripLook } from '@/store/tripLook';
import { useFeedback } from '@/store/feedback';
import { useIsDemo } from '@/store/prefs';
import { FeedbackBanner, FeedbackBell } from '@/ui/Feedback';
import { DraggableGrid } from '@/ui/DraggableGrid';
import { SwipeableExpenseRow } from '@/ui/SwipeableExpenseRow';
import { useExpenseActions } from '@/hooks/useExpenseActions';
import {
  Avatar,
  Button,
  Card,
  ErrorView,
  Loading, ScreenSkeleton,
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
  const { session } = useAuth();
  const layout = useHomeLayout(!!session && !session.user.is_anonymous);
  const order = useMemo(() => resolveHomeOrder(layout.order), [layout.order]);
  const setHomeOrder = layout.setOrder;
  const [arranging, setArranging] = useState(false);
  // For dragging cards: the page scrolls along and stops scrolling by itself meanwhile
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scroll = useRef({ y: 0, max: 0, contentH: 0, viewH: 0 });
  const measure = (patch: Partial<typeof scroll.current>) => {
    Object.assign(scroll.current, patch);
    scroll.current.max = Math.max(0, scroll.current.contentH - scroll.current.viewH);
  };
  const [draggingCard, setDraggingCard] = useState(false);
  const coverUrl = useTripLook((s) => s.coverUrl);
  const actions = useExpenseActions(trip?.id ?? '');
  // Feedback: signed-in users only (not the demo); opens by itself once per app start
  const demo = useIsDemo();
  const canFeedback = !!session && !session.user.is_anonymous && !demo;
  const feedbackShown = useFeedback((s) => s.shownThisSession);
  useEffect(() => {
    if (!canFeedback || !trip || feedbackShown) return;
    const id = setTimeout(() => {
      useFeedback.getState().markShown();
      useFeedback.getState().setOpen(true);
    }, 1200);
    return () => clearTimeout(id);
  }, [canFeedback, trip?.id, feedbackShown]);
  // The panel lives at the top of the page: bring it into view when it opens
  const feedbackOpen = useFeedback((s) => s.open);
  useEffect(() => {
    if (feedbackOpen) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [feedbackOpen]);

  const trend = useMemo(() => {
    if (!trip || !stats) return [];
    const map = new Map(stats.byDay.map((d) => [d.day, d.total]));
    return lastNDays(7, new Date(), trip.timezone).map((day) => ({ day, total: map.get(day) ?? 0 }));
  }, [trip, stats]);

  if (!trip) return null;
  if (data.isLoading) return <ScreenSkeleton />;
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
  const jointPaid = expenses.reduce((t, e) => (e.kind === 'expense' && e.paid_by_member_id === null ? t + e.amount_ils_minor : t), 0);
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const notStarted = !!trip.start_date && today < trip.start_date;

  // Cards in the order chosen on this phone (Arrange)
  const hasData = expenses.length > 0;
  const sections: Record<HomeSection, ReactNode> = {
    hero: (
      // Outer layer carries the shadow; the inner one clips the gradient to the rounded corners
      // Accent glow matches the floating + button (trip accent): 40% border, soft 15% halo
      <View style={{ borderRadius: radius.xl, boxShadow: `0 0 15px ${c.primary}26, 0 10px 28px ${c.heroFrom}59` }}>
      <View
        style={{
          backgroundColor: c.heroFrom,
          borderRadius: radius.xl,
          borderWidth: 1,
          borderColor: c.primary + '66',
          padding: space.xl,
          gap: space.md,
          overflow: 'hidden',
        }}
      >
        {/* Decoration only: gradient + soft inner glow, under the text, never on top of it */}
        <Svg pointerEvents="none" width="100%" height="100%" style={{ position: 'absolute', top: 0, start: 0, zIndex: 0 }}>
          <Defs>
            <LinearGradient id="heroFill" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.heroFrom} />
              <Stop offset="1" stopColor={c.heroTo} />
            </LinearGradient>
            <RadialGradient id="heroGlow" cx="0.8" cy="0.15" r="0.75">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={HERO_GLOW_OPACITY} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#heroFill)" />
          <Rect width="100%" height="100%" fill="url(#heroGlow)" />
        </Svg>
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
    // Also shown after a partner was removed while money is still open between you
    couple:
      balances.length > 1 ? (
        <Card>
          <SectionHeader title={t('home.couple')} />
          {balances.map((b) => {
            const m = memberById.get(b.memberId);
            if (!m) return null;
            return (
              <View key={b.memberId} style={{ gap: 6 }}>
                <Row gap={space.md}>
                  <Avatar name={m.display_name} color={m.color} photoPath={m.photo_path} />
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
          {/* Paid from joint money: part of the total, never a debt */}
          {jointPaid > 0 ? (
            <View style={{ gap: 6 }}>
              <Row gap={space.md}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Text>🤝</Text>
                </View>
                <Text style={{ flex: 1, fontWeight: '600' }}>{t('details.jointMoney')}</Text>
                <Text variant="mono">{ils(jointPaid)}</Text>
              </Row>
              <ProgressBar value={percent(jointPaid, stats.total)} color={c.textMuted} height={6} />
            </View>
          ) : null}
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
        {/* Same swipe row as the Expenses tab: swipe for edit / delete */}
        {expenses.slice(0, 5).map((e) => (
          <SwipeableExpenseRow
            key={e.id}
            expense={e}
            first={false}
            last={false}
            inset={false}
            category={e.category_id ? categoryById.get(e.category_id) : undefined}
            payer={memberById.get(e.paid_by_member_id ?? '')}
            recipient={memberById.get(e.expense_splits[0]?.member_id)}
            onOpen={() => actions.open(e)}
            onEdit={() => actions.edit(e)}
            onDelete={() => actions.remove(e)}
          />
        ))}
      </Card>
    ) : null,
  };

  return (
    <View style={{ flex: 1 }}>
    <Screen
      ref={scrollRef}
      scrollEnabled={!draggingCard}
      scrollEventThrottle={16}
      onScroll={(e) => (scroll.current.y = e.nativeEvent.contentOffset.y)}
      onContentSizeChange={(_w, h) => measure({ contentH: h })}
      onLayout={(e) => measure({ viewH: e.nativeEvent.layout.height })}
      refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} />}
    >
      {/* Feedback panel: takes its own space at the top and pushes the screen down */}
      {canFeedback ? <FeedbackBanner tripId={trip.id} /> : null}
      {/* The trip photo (Settings › Trip details) */}
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: 140, borderRadius: radius.xl, backgroundColor: c.cardAlt }}
        />
      ) : null}
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
        {/* Subtle invite entry until the partner joins; the code itself lives in Settings */}
        {members.length < 2 && !trip.shared && invite.data ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.invitePartner')}
            onPress={() => router.push('/settings')}
            hitSlop={8}
            style={{ padding: 6 }}
          >
            <Ionicons name="person-add-outline" size={20} color={c.primary} />
          </Pressable>
        ) : null}
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
        {/* Last in the row: top left in Hebrew */}
        {canFeedback ? <FeedbackBell /> : null}
      </Row>

      <SyncStatus tripId={trip.id} />
      <BudgetAlertBanner status={data.topAlert} categories={categoryById} members={memberById} />

      <DraggableGrid
        items={order.filter((k) => sections[k]).map((k) => ({ key: k, node: sections[k], radius: k === 'hero' ? radius.xl : radius.lg }))}
        onReorder={(visible) => setHomeOrder(mergeVisibleOrder(order, visible))}
        scrollRef={scrollRef}
        scroll={scroll}
        onDragging={setDraggingCard}
      />

      {!hasData ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.addFirst')}
          onPress={() => router.push('/expense/new')}
          style={({ pressed }) => ({
            alignItems: 'center',
            gap: space.md,
            paddingVertical: space.xl * 1.5,
            borderRadius: radius.xl,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: c.primary + '66',
            backgroundColor: pressed ? c.primarySoft : c.card,
          })}
        >
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={40} color={readableOn(c.primary)} />
          </View>
          <Text variant="h2" center>
            {t('home.addFirst')}
          </Text>
        </Pressable>
      ) : null}

      <Sheet visible={arranging} onClose={() => setArranging(false)} title={t('home.arrangeTitle')} scroll={false}>
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
    </View>
  );
}
