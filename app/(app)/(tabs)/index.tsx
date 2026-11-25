import { onlineManager } from '@tanstack/react-query';
import { primeKeyboard } from '@/lib/keyboardPrimer';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, RefreshControl, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { HERO_GLOW_OPACITY } from '@/palette';
import { claimFeedbackPrompt, useHomeLayout, useInviteCode } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { getCurrency, HOME_CURRENCY } from '@/lib/currencies';
import { tripRefundTotal } from '@/lib/taxFree';
import { myShareExpenses, personalTotal } from '@/lib/settlement';
import { homeLayoutValue, mergeVisibleOrder, resolveHomeLayout, type HomeSection } from '@/lib/homeLayout';
import { formatMoney, percent } from '@/lib/money';
import { computeTripStats, daysInclusive, dayKey, lastNDays, type TripStats } from '@/lib/stats';
import { readableOn } from '@/lib/contrast';
import { alertColor, radius, space, useColors } from '@/theme';
import { BudgetAlertBanner } from '@/ui/BudgetAlert';
import { Sheet } from '@/ui/Sheet';
import { SortableList } from '@/ui/SortableList';
import { SwipeRow } from '@/ui/SwipeRow';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { DailyAverageSheet } from '@/ui/DailyAverageSheet';
import { InfoTip } from '@/ui/InfoTip';
import { ImportBadge } from '@/ui/ImportBadge';
import { checklistItem, Topbar, TopbarIcon, useThemeMenuItem } from '@/ui/Topbar';
import { SmartImportSheet } from '@/ui/SmartImportSheet';
import { smartImportBadge, useSmartImports } from '@/store/smartImports';
import { ViewSelect } from '@/ui/ViewSelect';
import { scheduleLaunchSnapshot } from '@/lib/launchSnapshot';
import { sessionStorageKey } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useTripLook } from '@/store/tripLook';
import { useFeedback } from '@/store/feedback';
import { useIsDemo, usePrefs, type HomeView } from '@/store/prefs';
import { useScrollTopOnTabTap } from '@/store/tabTap';
import { FeedbackBanner, FeedbackBell } from '@/ui/Feedback';
import { PasskeyOffer } from '@/ui/Passkeys';
import { DraggableGrid } from '@/ui/DraggableGrid';
import { SwipeableExpenseRow } from '@/ui/SwipeableExpenseRow';
import { useExpenseActions } from '@/hooks/useExpenseActions';
import { useConfirmPending } from '@/hooks/usePendingReview';
import { pendingForMe } from '@/lib/pendingReview';
import { PendingInbox } from '@/ui/PendingInbox';
import { VoiceInbox } from '@/ui/VoiceInbox';
import { ExportSheet } from '@/ui/ExportSheet';
import { useRefreshAll } from '@/hooks/useRefreshAll';
import {
  Avatar,
  Button,
  Card,
  ErrorView,
  Loading, ScreenSkeleton, OfflineNoData,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/ui/primitives';

const SECTION_ICONS: Record<HomeSection, string> = { hero: '💰', today: '📅', couple: '👫', trend: '📊', categories: '🏷️', recent: '🧾', taxfree: '🛍️' };

export default function Home() {
  const { t, lang } = useT();
  const c = useColors();
  // Text on the total card follows the card colour (white on dark, ink on light)
  const onHero = readableOn(c.heroFrom);
  const data = useTripData();
  const { trip, stats, members, expenses, balances, transfers, memberById, categoryById, me } = data;
  // Invite codes only apply to regular trips; in the shared MVP trip everyone joins with Start
  const invite = useInviteCode(members.length < 2 && !trip?.shared ? trip?.id : undefined);
  const ils = (m: number) => formatMoney(m, HOME_CURRENCY, { lang });
  const taxFree = useMemo(() => tripRefundTotal(expenses, (code) => getCurrency(code).minor_units), [expenses]);
  const { session } = useAuth();
  const layout = useHomeLayout(!!session && !session.user.is_anonymous);
  // Cards on show in their order, and cards hidden from Home (swipe a card › Hide; Arrange brings them back)
  const { visible: order, hidden } = useMemo(() => resolveHomeLayout(layout.order), [layout.order]);
  const setHomeOrder = layout.setOrder;
  const hideCard = (key: HomeSection) => setHomeOrder(homeLayoutValue(order.filter((k) => k !== key), [...hidden, key]));
  const showCard = (key: HomeSection) => setHomeOrder(homeLayoutValue([...order, key], hidden.filter((k) => k !== key)));
  const [arranging, setArranging] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // For dragging cards: the page scrolls along and stops scrolling by itself meanwhile
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scroll = useRef({ y: 0, max: 0, contentH: 0, viewH: 0 });
  const measure = (patch: Partial<typeof scroll.current>) => {
    Object.assign(scroll.current, patch);
    scroll.current.max = Math.max(0, scroll.current.contentH - scroll.current.viewH);
  };
  const [draggingCard, setDraggingCard] = useState(false);
  useScrollTopOnTabTap('index', scrollRef);
  // Pull down at the top: skeleton until the refresh has finished
  const refreshAll = useRefreshAll();
  const [avgOpen, setAvgOpen] = useState(false);
  const coverUrl = useTripLook((s) => s.coverUrl);
  const actions = useExpenseActions(trip?.id ?? '');
  // Feedback: signed-in users only (not the demo). Opens by itself once per
  // account (the first time Home opens after signing up), on any device; after
  // that only from the bell. The server keeps the "already asked" mark; this
  // device remembers it too, so it never asks the server again.
  const demo = useIsDemo();
  const userId = session?.user.id;
  // Payments a Shortcut added, waiting for this person's OK (only they see them)
  const pendingReview = useMemo(() => pendingForMe(expenses, userId), [expenses, userId]);
  const confirmPending = useConfirmPending(trip?.id ?? '', members, me?.id ?? null);
  const canFeedback = !!session && !session.user.is_anonymous && !demo;
  const feedbackChecked = useFeedback((s) => s.shownThisSession);
  const feedbackPrompted = usePrefs((s) => !!userId && s.feedbackPrompted.includes(userId));
  useEffect(() => {
    if (!canFeedback || !trip || !userId || feedbackChecked || feedbackPrompted) return;
    const id = setTimeout(async () => {
      // Offline: ask on a later start
      if (!onlineManager.isOnline()) return;
      useFeedback.getState().markShown();
      try {
        const first = await claimFeedbackPrompt();
        usePrefs.getState().markFeedbackPrompted(userId);
        if (first) useFeedback.getState().setOpen(true);
      } catch {
        // No answer from the server: try again on the next start
      }
    }, 1200);
    return () => clearTimeout(id);
  }, [canFeedback, trip?.id, userId, feedbackChecked, feedbackPrompted]);
  // Web: keep a copy of this screen so the next launch can show it at once
  useEffect(() => {
    if (canFeedback && trip) scheduleLaunchSnapshot(sessionStorageKey());
  });
  // The panel lives at the top of the page: bring it into view when it opens
  const feedbackOpen = useFeedback((s) => s.open);
  useEffect(() => {
    if (feedbackOpen) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [feedbackOpen]);

  // "My share" figures: each expense counted as the part split to you (your
  // personal ones in full, your share of shared ones). Only with partners.
  const myExpenses = useMemo(
    () => (me && members.length > 1 ? myShareExpenses(expenses.map((e) => ({ ...e, splits: e.expense_splits })), me.id) : null),
    [expenses, me, members.length],
  );
  const myStats = useMemo(
    () =>
      trip && myExpenses
        ? computeTripStats({
            expenses: myExpenses,
            timeZone: trip.timezone,
            now: new Date(),
            startDate: trip.start_date,
            endDate: trip.end_date,
            totalBudget: null,
            dailyBudget: null,
          })
        : null,
    [trip, myExpenses],
  );
  // What each card shows (its pill), remembered on this device
  const homeViews = usePrefs((s) => s.homeViews);
  const setHomeView = usePrefs((s) => s.setHomeView);
  const viewOf = (card: string): HomeView => (myStats && homeViews[card] === 'mine' ? 'mine' : 'trip');
  const themeItem = useThemeMenuItem();
  const [importOpen, setImportOpen] = useState(false);
  // A Smart import waiting on this device: a dot on the gear, a badge in the menu
  const importBadge = useSmartImports((s) => smartImportBadge(s.records, trip?.id));

  if (!trip) return null;
  if (data.offlineEmpty) return <OfflineNoData onRetry={data.refetch} />;
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
  const statsOf = (card: string): TripStats => (viewOf(card) === 'mine' && myStats ? myStats : stats);
  const picker = (card: string, title: string, opts: { color?: string; compact?: boolean } = {}) =>
    myStats ? <ViewSelect value={viewOf(card)} onChange={(v) => setHomeView(card, v)} title={title} {...opts} /> : null;
  const trendMap = new Map(statsOf('trend').byDay.map((d) => [d.day, d.total]));
  const trend = lastNDays(7, new Date(), trip.timezone).map((day) => ({ day, total: trendMap.get(day) ?? 0 }));
  const maxTrend = Math.max(1, ...trend.map((d) => d.total));
  const heroMine = viewOf('hero') === 'mine' && myStats ? myStats : null;
  const todayStats = statsOf('today');
  const avgStats = statsOf('avg');
  const jointPaid = expenses.reduce((t, e) => (e.kind === 'expense' && e.paid_by_member_id === null ? t + e.amount_ils_minor : t), 0);
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const notStarted = !!trip.start_date && today < trip.start_date;
  // Your personal spending: only expenses marked Personal for you (shared ones belong to the shared budget).
  // Shown only to you, and only when there is some, so a couple on one joint budget sees just the shared numbers.
  const personal = me ? personalTotal(expenses.map((e) => ({ ...e, splits: e.expense_splits })), me.id) : 0;
  const myShare = personal > 0 ? personal : null;
  // One traveller: "budget", not "shared budget"
  const solo = members.length < 2;

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
          {/* The card's pill sits at its end (top left in Hebrew): whole trip or your share */}
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label" color={onHero} style={{ flexShrink: 1 }}>
              {heroMine ? t('home.view.mineTitle') : t('home.spent')}
            </Text>
            {picker('hero', t('home.sections.hero'), { color: onHero })}
          </Row>
          <Text variant="hero" color={onHero}>
            {ils(heroMine ? heroMine.total : stats.total)}
          </Text>
          {heroMine ? (
            <Text variant="label" color={onHero}>
              {t('home.view.ofTrip', { pct: percent(heroMine.total, stats.total), amount: ils(stats.total) })}
            </Text>
          ) : stats.budget ? (
            <>
              <ProgressBar value={stats.pctUsed} color={onHero} track={onHero + '40'} height={10} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label" color={onHero}>
                  {t('home.pctUsed', { pct: stats.pctUsed })}
                </Text>
                <Text variant="label" color={onHero} style={{ fontWeight: '700' }}>
                  {stats.remaining! >= 0 ? t('home.remaining', { amount: ils(stats.remaining!) }) : t('home.over', { amount: ils(-stats.remaining!) })}
                </Text>
              </Row>
            </>
          ) : null}
          {/* Two numbers: the group's shared budget, and your own part of the spending */}
          {stats.budget || myShare != null ? (
            <Row style={{ borderTopWidth: 1, borderTopColor: onHero + '33', paddingTop: space.md, alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="caption" color={onHero}>
                  {solo ? t('home.budgetSolo') : t('home.sharedBudget')}
                </Text>
                <Text color={onHero} style={{ fontWeight: '700', fontSize: 18 }}>
                  {stats.budget ? ils(stats.budget) : t('budget.notSet')}
                </Text>
              </View>
              {myShare != null ? (
                <>
                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: onHero + '33', marginHorizontal: space.md }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Row style={{ gap: 6 }}>
                    <Text variant="caption" color={onHero}>
                      {t('home.yourShare')}
                    </Text>
                    <InfoTip label={t('home.privateInfoLabel')} icon="lock-closed" color={onHero} circled size={14}>
                      <Text variant="label">{t('home.privateInfo')}</Text>
                    </InfoTip>
                  </Row>
                  <Text color={onHero} style={{ fontWeight: '700', fontSize: 18 }}>
                    {ils(myShare)}
                  </Text>
                </View>
                </>
              ) : null}
            </Row>
          ) : null}
          {/* No budget yet: a link to the budget in Trip settings */}
          {!stats.budget && !heroMine ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/settings', params: { edit: 'trip' } })}
              hitSlop={6}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}
            >
              <Text variant="label" color={onHero} style={{ textDecorationLine: 'underline', flexShrink: 1 }}>
                {solo ? t('home.noBudgetSolo') : t('home.noBudget')}
              </Text>
              <Ionicons name={lang === 'he' ? 'chevron-back' : 'chevron-forward'} size={14} color={onHero} />
            </Pressable>
          ) : null}
        </View>
      </View>
      </View>
    ),
    today: (
      <Row gap={space.md} align="stretch">
        <Card style={{ flex: 1, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }} gap={4}>
            <Text variant="label" muted numberOfLines={1} style={{ flexShrink: 1 }}>
              {t('home.today')}
            </Text>
            {picker('today', t('home.today'), { compact: true })}
          </Row>
          <Text variant="h2" style={{ fontSize: 20 }}>
            {ils(todayStats.today)}
          </Text>
          {stats.dailyBudget && viewOf('today') === 'trip' ? (
            <>
              <ProgressBar value={stats.todayPct} color={alertColor(c, stats.todayPct)} height={6} />
              <Text variant="caption" muted>
                {t('home.dailyLimit')}: {ils(stats.dailyBudget)}
              </Text>
            </>
          ) : null}
        </Card>
        {/* Tap the card: the average per category. The card's surface is its own
            layer under the words, so the ⓘ can be a separate button (a button
            inside a button isn't allowed on the web). */}
        <View style={{ flex: 1 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.avgOpen')}
            onPress={() => setAvgOpen(true)}
            style={({ pressed }) => [
              StyleSheet.absoluteFill,
              {
                backgroundColor: c.card,
                borderRadius: radius.lg,
                shadowColor: '#11142D',
                shadowOpacity: 0.05,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 1,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          />
          <View pointerEvents="box-none" style={{ flex: 1, padding: space.lg, gap: 6 }}>
            <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              {/* The label, then ⓘ at its end: how the figure is worked out */}
              <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                <View pointerEvents="none" style={{ flexShrink: 1 }}>
                  <Text variant="label" muted numberOfLines={2}>
                    {t('home.dailyAvg')}
                  </Text>
                </View>
                <InfoTip label={t('home.avgInfo')}>
                  <Text variant="label">
                    {avgStats.daysElapsed ? t('home.avgMath', { amount: ils(avgStats.averagedTotal), count: avgStats.daysElapsed }) : t('home.avgNotStarted')}
                  </Text>
                  {avgStats.preTrip > 0 ? (
                    <Text variant="caption" muted>
                      {t('home.avgExcludesPre', { amount: ils(avgStats.preTrip) })}
                    </Text>
                  ) : null}
                  {avgStats.projected != null ? (
                    <Text variant="caption" muted>
                      {t('home.projected')}: {ils(avgStats.projected)}
                    </Text>
                  ) : null}
                  <Text variant="caption" faint style={{ marginTop: 4 }}>
                    {t('home.avgTapHint')}
                  </Text>
                </InfoTip>
              </View>
              {myStats ? (
                picker('avg', t('home.dailyAvg'), { compact: true })
              ) : (
                <View pointerEvents="none">
                  <Ionicons name={lang === 'he' ? 'chevron-back' : 'chevron-forward'} size={14} color={c.textFaint} />
                </View>
              )}
            </View>
            <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <Text variant="h2" style={{ fontSize: 20 }}>
                {ils(avgStats.dailyAverage)}
              </Text>
              {myStats ? <Ionicons name={lang === 'he' ? 'chevron-back' : 'chevron-forward'} size={14} color={c.textFaint} /> : null}
            </View>
          </View>
        </View>
      </Row>
    ),
    // Expected VAT refund (estimate) from the purchases marked tax free
    taxfree: (
      <Card style={{ gap: 6 }}>
        <SectionHeader title={t('taxFree.cardTitle')} />
        <Text variant="h2" style={{ fontSize: 22 }} color={taxFree.total > 0 ? c.primary : c.textMuted}>
          {t('taxFree.cardUpTo', { amount: ils(taxFree.total) })}
        </Text>
        {taxFree.count + taxFree.belowMin + taxFree.noRule === 0 ? (
          <Text variant="caption" muted>
            {t('taxFree.cardEmpty')}
          </Text>
        ) : (
          <>
            {taxFree.count > 0 ? (
              <Text variant="caption" muted>
                {t('taxFree.cardCount', { count: taxFree.count })}
              </Text>
            ) : null}
            {taxFree.belowMin > 0 ? (
              <Text variant="caption" color={c.warning}>
                {t('taxFree.cardBelowMin', { count: taxFree.belowMin })}
              </Text>
            ) : null}
            {taxFree.noRule > 0 ? (
              <Text variant="caption" muted>
                {t('taxFree.cardNoRules', { count: taxFree.noRule })}
              </Text>
            ) : null}
            <Text variant="caption" faint>
              {t('taxFree.cardNote')}
            </Text>
          </>
        )}
      </Card>
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
        <SectionHeader title={t('home.trend')} end={picker('trend', t('home.trend'))} />
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
        <SectionHeader title={t('home.byCategory')} end={picker('categories', t('home.byCategory'))} />
        {statsOf('categories').byCategory.slice(0, 5).map((row) => {
          const cat = row.categoryId ? categoryById.get(row.categoryId) : undefined;
          const color = cat?.color ?? UNCATEGORIZED.color;
          return (
            <View key={row.categoryId ?? 'none'} style={{ gap: 6 }}>
              <Row>
                <CategoryIcon category={cat} size={15} />
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
            memberById={memberById}
            meId={data.me?.id}
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
      onRefresh={refreshAll}
      refreshEnabled={!draggingCard}
    >
      {/* Feedback panel: takes its own space at the top and pushes the screen down */}
      {canFeedback ? <FeedbackBanner tripId={trip.id} /> : null}
      {/* The trip photo (Settings › Trip settings) */}
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: 140, borderRadius: radius.xl, backgroundColor: c.cardAlt }}
        />
      ) : null}
      {/* ⚙ last in the bar (top left in Hebrew): Smart import, Arrange, light / dark, Recently deleted, Filter, and what is coming */}
      <Topbar
        eyebrow={
          dayN && (!trip.end_date || today <= trip.end_date)
            ? t('home.dayN', { n: dayN })
            : notStarted
              ? t('home.startsOn', { date: new Date(trip.start_date + 'T12:00:00Z').toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }) })
              : undefined
        }
        title={trip.name}
        menuLabel={t('home.menu.title')}
        badge={importBadge ? (importBadge === 'ready' ? c.primary : importBadge === 'error' ? c.danger : c.textMuted) : null}
        menu={[
          {
            key: 'smartImport',
            icon: 'sparkles-outline',
            label: t('home.menu.smartImport'),
            right: importBadge ? <ImportBadge status={importBadge} /> : undefined,
            onPress: () => setImportOpen(true),
          },
          checklistItem(t),
          { key: 'arrange', icon: 'swap-vertical', label: t('home.menu.arrange'), onPress: () => setArranging(true) },
          themeItem,
          { key: 'deleted', icon: 'trash-outline', label: t('home.menu.deleted'), onPress: () => router.push('/deleted') },
          { key: 'filter', icon: 'funnel-outline', label: t('home.menu.filter'), onPress: () => router.push({ pathname: '/expenses', params: { filter: '1' } }) },
          { key: 'export', icon: 'download-outline', label: t('export.menu'), onPress: () => setExportOpen(true) },
          { key: 'share', icon: 'share-social-outline', label: t('home.menu.share'), disabled: true, hint: t('home.menu.soon') },
        ]}
        extra={
          <>
            {/* Subtle invite entry until the partner joins; the code itself lives in Settings */}
            {members.length < 2 && !trip.shared && invite.data ? <TopbarIcon icon="person-add-outline" label={t('home.invitePartner')} onPress={() => router.push('/settings')} /> : null}
            {canFeedback ? <FeedbackBell /> : null}
          </>
        }
      />

      <PasskeyOffer />
      <BudgetAlertBanner tripId={trip.id} status={data.topAlert} categories={categoryById} members={memberById} />
      <VoiceInbox tripId={trip?.id} />
      <PendingInbox items={pendingReview} all={expenses} solo={members.length < 2} onConfirm={confirmPending} onEdit={actions.edit} onDismiss={(e) => actions.remove(e)} />

      {/* Hold a card to drag it; swipe it (right in Hebrew) for Hide. Rows inside a card swipe on their own. */}
      <DraggableGrid
        items={order
          .filter((k) => sections[k])
          .map((k) => ({
            key: k,
            radius: k === 'hero' ? radius.xl : radius.lg,
            node: (
              <SwipeRow
                background={c.bg}
                style={{ borderRadius: k === 'hero' ? radius.xl : radius.lg }}
                yieldToInner
                clipWhenClosed={false}
                autoCloseMs={4000}
                actions={[{ key: 'hide', icon: 'eye-off-outline', color: c.textMuted, label: t('home.hideCard'), onPress: () => hideCard(k) }]}
              >
                {() => sections[k]}
              </SwipeRow>
            ),
          }))}
        onReorder={(visible) => setHomeOrder(homeLayoutValue(mergeVisibleOrder(order, visible), hidden))}
        scrollRef={scrollRef}
        scroll={scroll}
        onDragging={setDraggingCard}
      />

      {!hasData ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home.addFirst')}
          onPress={() => {
            primeKeyboard();
            router.push('/expense/new');
          }}
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

      <SmartImportSheet visible={importOpen} onClose={() => setImportOpen(false)} tripId={trip.id} />
      <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} />
      <Sheet visible={arranging} onClose={() => setArranging(false)} title={t('home.arrangeTitle')} scroll={false} dragContent={false}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Text variant="caption" muted center>
            {t('home.arrangeHint')}
          </Text>
          <SortableList
            items={order.map((k) => ({ key: k, label: t(`home.sections.${k}`), icon: SECTION_ICONS[k] }))}
            onChange={(keys) => setHomeOrder(homeLayoutValue(keys, hidden))}
          />
          {/* Cards hidden from Home, under a line (like hidden categories): Show puts one back at the end */}
          {hidden.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <View style={{ height: 1, backgroundColor: c.border, marginVertical: space.xs }} />
              <Text variant="label" muted>
                {t('home.hiddenCards')}
              </Text>
              {hidden.map((k) => (
                <Row key={k} gap={space.md} style={{ minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.cardAlt }}>
                  <Text style={{ fontSize: 20, opacity: 0.6 }}>{SECTION_ICONS[k]}</Text>
                  <Text muted style={{ flex: 1 }}>
                    {t(`home.sections.${k}`)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('home.showCard')}: ${t(`home.sections.${k}`)}`}
                    onPress={() => showCard(k)}
                    hitSlop={8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: space.sm }}
                  >
                    <Ionicons name="eye-outline" size={18} color={c.primary} />
                    <Text variant="label" color={c.primary}>
                      {t('home.showCard')}
                    </Text>
                  </Pressable>
                </Row>
              ))}
            </View>
          ) : null}
          <Button title={t('common.done')} onPress={() => setArranging(false)} />
          <Button title={t('home.arrangeReset')} variant="ghost" icon="refresh" onPress={() => setHomeOrder(null)} />
        </View>
      </Sheet>
      {stats ? (
        <DailyAverageSheet
          visible={avgOpen}
          onClose={() => setAvgOpen(false)}
          stats={avgStats}
          expenses={viewOf('avg') === 'mine' && myExpenses ? myExpenses : expenses}
          categoryById={categoryById}
          timeZone={trip.timezone}
        />
      ) : null}
    </Screen>
    </View>
  );
}
