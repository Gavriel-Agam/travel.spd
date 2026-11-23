import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { blockedInDemo } from '@/lib/demoPrompt';
import { SmartImportSheet } from '@/ui/SmartImportSheet';
import { Topbar, tripSettingsItem } from '@/ui/Topbar';
import { VoiceInbox } from '@/ui/VoiceInbox';
import { ExportSheet } from '@/ui/ExportSheet';
import { PullRefresh } from '@/ui/PullRefresh';
import { BalanceBanner } from '@/ui/NetChips';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useExpenseActions } from '@/hooks/useExpenseActions';
import { useDragScroll } from '@/hooks/useCardOrder';
import { dayHeadingKey, dropAcrossDays, orderDay } from '@/lib/expenseOrder';
import { usePrefs } from '@/store/prefs';
import { useScrollTopOnTabTap } from '@/store/tabTap';
import { DraggableGrid } from '@/ui/DraggableGrid';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney } from '@/lib/money';
import { dayKey } from '@/lib/stats';
import { radius, space, useColors } from '@/theme';
import { DateField } from '@/ui/DateField';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { SwipeableExpenseRow } from '@/ui/SwipeableExpenseRow';
import { Chip, EmptyState, IconButton, ErrorView, Row, ScreenSkeleton, Text, TripBackdrop } from '@/ui/primitives';
import type { Expense } from '@/types/db';

export default function Expenses() {
  const { t, lang } = useT();
  const c = useColors();
  const data = useTripData();
  const { trip, expenses, categories, members, memberById, categoryById } = data;
  const actions = useExpenseActions(trip?.id ?? '');
  // Hold an expense and drag it to another place in its day or onto another day.
  // The order within a day is kept on this device; a new day changes the date.
  const drag = useDragScroll();
  // Pull down at the top: skeleton rows until the refresh has finished
  const pull = usePullToRefresh(data.refetch, { getY: () => drag.scroll.current.y, enabled: drag.scrollProps.scrollEnabled });
  useScrollTopOnTabTap('expenses', drag.scrollRef);
  const savedOrder = usePrefs((s) => s.expenseOrder[trip?.id ?? '']);
  const setExpenseOrder = usePrefs((s) => s.setExpenseOrder);

  const [query, setQuery] = useState('');
  // Home's menu › Filter opens this screen with the filters showing
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => {
    if (filterParam !== '1') return;
    setShowFilters(true);
    router.setParams({ filter: undefined });
  }, [filterParam]);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  // Quick filter: only expenses with a receipt, or with a flight / hotel booking
  const [attach, setAttach] = useState<'receipt' | 'booking' | null>(null);

  const tz = trip?.timezone ?? 'UTC';
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const activeFilters = [categoryId, payerId, from, to, attach].filter(Boolean).length;

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromKey = from ? dayKey(from, tz) : null;
    const toKey = to ? dayKey(to, tz) : null;
    const filtered = expenses.filter((e) => {
      if (categoryId && e.category_id !== categoryId) return false;
      if (attach === 'receipt' && !e.receipt_path) return false;
      if (attach === 'booking' && !e.booking_details) return false;
      // '__joint' filters for joint-money expenses (no payer)
      if (payerId && (payerId === '__joint' ? e.paid_by_member_id !== null : e.paid_by_member_id !== payerId)) return false;
      const d = dayKey(e.occurred_at, tz);
      if (fromKey && d < fromKey) return false;
      if (toKey && d > toKey) return false;
      if (q) {
        const cat = e.category_id ? categoryById.get(e.category_id) : undefined;
        const hay = `${e.description} ${e.notes ?? ''} ${e.merchant ?? ''} ${categoryLabel(cat, t)} ${e.currency}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const byDay = (list: Expense[]) => {
      const groups = new Map<string, Expense[]>();
      for (const e of list) {
        const d = dayKey(e.occurred_at, tz);
        if (!groups.has(d)) groups.set(d, []);
        groups.get(d)!.push(e);
      }
      return groups;
    };
    const all = byDay(expenses);
    return [...byDay(filtered).entries()].map(([day, data]) => ({
      day,
      data: orderDay(data, savedOrder?.[day]),
      // The whole day in its current order, including expenses a search or filter hides
      fullDay: orderDay(all.get(day) ?? [], savedOrder?.[day]).map((e) => e.id),
      total: data.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount_ils_minor, 0),
    }));
  }, [expenses, query, categoryId, payerId, from, to, attach, tz, categoryById, t, savedOrder]);

  if (!trip) return null;

  const today = dayKey(new Date(), tz);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000), tz);
  const dayTitle = (d: string) =>
    d === today
      ? t('common.today')
      : d === yesterday
        ? t('common.yesterday')
        : new Date(d + 'T12:00:00Z').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <TripBackdrop />
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.sm }}>
        {/* ⚙ at the end of the bar (top left in Hebrew): Filter, Recently deleted, Smart import, Trip settings; 🔍 beside it */}
        <Topbar
          title={t('expenses.title')}
          search={{ value: query, onChange: setQuery, placeholder: t('expenses.searchPlaceholder') }}
          menuLabel={t('expenses.moreOptions')}
          menu={[
            {
              key: 'filter',
              icon: 'funnel-outline',
              label: t('expenses.filters'),
              right: activeFilters ? <CountBadge n={activeFilters} /> : undefined,
              onPress: () => setShowFilters((v) => !v),
            },
            { key: 'deleted', icon: 'trash-outline', label: t('deleted.title'), onPress: () => router.push('/deleted') },
            { key: 'smartImport', icon: 'sparkles-outline', label: t('home.menu.smartImport'), onPress: () => !blockedInDemo(qc) && setImportOpen(true) },
            { key: 'export', icon: 'download-outline', label: t('export.menu'), onPress: () => setExportOpen(true) },
            tripSettingsItem(t),
          ]}
        />
        {showFilters ? (
          <View style={{ gap: space.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="label" muted>
                {t('expenses.filters')}
              </Text>
              <IconButton name="close" size={20} label={t('expenses.closeFilters')} onPress={() => setShowFilters(false)} />
            </Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              <Chip label={t('expenses.withReceipt')} icon="🧾" selected={attach === 'receipt'} onPress={() => setAttach(attach === 'receipt' ? null : 'receipt')} />
              <Chip label={t('expenses.withBooking')} icon="✈️" selected={attach === 'booking'} onPress={() => setAttach(attach === 'booking' ? null : 'booking')} />
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              <Chip label={t('common.all')} selected={!payerId} onPress={() => setPayerId(null)} />
              {members.map((m) => (
                <Chip key={m.id} label={m.display_name} selected={payerId === m.id} color={m.color} onPress={() => setPayerId(payerId === m.id ? null : m.id)} />
              ))}
              <Chip label={t('form.joint')} icon="🤝" selected={payerId === '__joint'} onPress={() => setPayerId(payerId === '__joint' ? null : '__joint')} />
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              <Chip label={t('common.all')} selected={!categoryId} onPress={() => setCategoryId(null)} />
              {categories.map((cat) => (
                <Chip
                  key={cat.id}
                  icon={<CategoryIcon category={cat} size={15} />}
                  label={categoryLabel(cat, t)}
                  selected={categoryId === cat.id}
                  color={cat.color}
                  onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
                />
              ))}
            </ScrollView>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              <Text variant="label" muted>
                {t('expenses.from')}
              </Text>
              {from ? <DateField value={from} onChange={setFrom} /> : <Chip label="…" onPress={() => setFrom(new Date())} />}
              <Text variant="label" muted>
                {t('expenses.to')}
              </Text>
              {to ? <DateField value={to} onChange={setTo} /> : <Chip label="…" onPress={() => setTo(new Date())} />}
              {activeFilters ? (
                <Chip
                  label={t('expenses.clear')}
                  onPress={() => {
                    setCategoryId(null);
                    setPayerId(null);
                    setFrom(null);
                    setTo(null);
                    setAttach(null);
                  }}
                />
              ) : null}
            </Row>
          </View>
        ) : null}
      </View>

      {data.offlineEmpty ? (
        <EmptyState emoji="📡" title={t('sync.noSavedTitle')} body={t('sync.noSavedBody')} action={t('common.retry')} onAction={data.refetch} />
      ) : data.isLoading ? (
        <ScreenSkeleton rowsOnly />
      ) : data.error ? (
        <ErrorView error={data.error} onRetry={data.refetch} />
      ) : (
        <ScrollView
          {...drag.scrollProps}
          {...pull.touchProps}
          style={Platform.OS === 'web' ? ({ overscrollBehaviorY: 'contain' } as object) : undefined}
          refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} />}
          contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}
        >
          <PullRefresh pull={pull.pull} refreshing={pull.refreshing} result={pull.result} />
          {/* Your running balance in the trip (green: owed to you, red: you owe); opens Settle up */}
          {data.me && members.length > 1 ? (
            <View style={{ marginBottom: space.md }}>
              <BalanceBanner net={data.balances.find((b) => b.memberId === data.me!.id)?.net ?? 0} onPress={() => router.push('/settle')} />
            </View>
          ) : null}
          <VoiceInbox tripId={trip?.id} />
          {sections.length ? null : expenses.length === 0 ? (
            <EmptyState emoji="🧾" title={t('home.emptyTitle')} body={t('home.emptyBody')} />
          ) : (
            <EmptyState emoji="🔍" title={t('expenses.empty')} body={t('expenses.emptyBody')} />
          )}
          {/* One list for every day, headings included, so an expense can be
              dropped under another day's heading. Headings can't be picked up and
              stay at the top while their day scrolls under them. */}
          <DraggableGrid
            columns={1}
            gap={0}
            items={sections.flatMap((section) => [
              {
                key: dayHeadingKey(section.day),
                fixed: true,
                sticky: true,
                radius: 0,
                node: (
                  <Row style={{ justifyContent: 'space-between', paddingVertical: space.sm, backgroundColor: c.bg }}>
                    <Text variant="label" muted>
                      {dayTitle(section.day)}
                    </Text>
                    <Text variant="label" muted>
                      {formatMoney(section.total, HOME_CURRENCY, { lang })}
                    </Text>
                  </Row>
                ),
              },
              ...section.data.map((item, index) => ({
                key: item.id,
                radius: radius.lg,
                node: (
                  <SwipeableExpenseRow
                    expense={item}
                    first={index === 0}
                    last={index === section.data.length - 1}
                    category={item.category_id ? categoryById.get(item.category_id) : undefined}
                    payer={memberById.get(item.paid_by_member_id ?? '')}
                    memberById={memberById}
                    meId={data.me?.id}
                    recipient={memberById.get(item.expense_splits[0]?.member_id)}
                    onOpen={() => actions.open(item)}
                    onEdit={() => actions.edit(item)}
                    onDelete={() => actions.remove(item)}
                    holdToDrag
                  />
                ),
              })),
            ])}
            onReorder={(keys) => {
              const { orders, moved } = dropAcrossDays(
                keys,
                sections.map((section) => ({ day: section.day, visible: section.data.map((e) => e.id), fullDay: section.fullDay })),
              );
              for (const [day, ids] of Object.entries(orders)) setExpenseOrder(trip.id, day, ids);
              if (moved) {
                const expense = expenses.find((e) => e.id === moved.id);
                if (expense) actions.moveToDay(expense, moved.to, tz);
              }
            }}
            scrollRef={drag.scrollRef}
            scroll={drag.scroll}
            onDragging={drag.setDragging}
          />
        </ScrollView>
      )}
      <SmartImportSheet visible={importOpen} onClose={() => setImportOpen(false)} tripId={trip.id} />
      <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} />
    </SafeAreaView>
  );
}

/** How many filters are on, beside Filter in the menu. */
function CountBadge({ n }: { n: number }) {
  const c = useColors();
  return (
    <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="caption" color={c.primaryText} style={{ fontWeight: '700' }}>
        {n}
      </Text>
    </View>
  );
}
