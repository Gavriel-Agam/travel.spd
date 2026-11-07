import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useExpenseActions } from '@/hooks/useExpenseActions';
import { useTripData } from '@/hooks/useTripData';
import { SyncStatus } from '@/ui/SyncStatus';
import { useT } from '@/i18n';
import { categoryLabel } from '@/lib/categories';
import { HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney } from '@/lib/money';
import { dayKey } from '@/lib/stats';
import { radius, space, useColors } from '@/theme';
import { DateField } from '@/ui/DateField';
import { SwipeableExpenseRow } from '@/ui/SwipeableExpenseRow';
import { Chip, EmptyState, ErrorView, Loading, Row, Text, TripBackdrop } from '@/ui/primitives';
import type { Expense } from '@/types/db';

export default function Expenses() {
  const { t, lang } = useT();
  const c = useColors();
  const data = useTripData();
  const { trip, expenses, categories, members, memberById, categoryById } = data;
  const actions = useExpenseActions(trip?.id ?? '');

  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);

  const tz = trip?.timezone ?? 'UTC';
  const locale = lang === 'he' ? 'he-IL' : 'en-US';
  const activeFilters = [categoryId, payerId, from, to].filter(Boolean).length;

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromKey = from ? dayKey(from, tz) : null;
    const toKey = to ? dayKey(to, tz) : null;
    const filtered = expenses.filter((e) => {
      if (categoryId && e.category_id !== categoryId) return false;
      // '__joint' filters for joint-money expenses (no payer)
      if (payerId && (payerId === '__joint' ? e.paid_by_member_id !== null : e.paid_by_member_id !== payerId)) return false;
      const d = dayKey(e.occurred_at, tz);
      if (fromKey && d < fromKey) return false;
      if (toKey && d > toKey) return false;
      if (q) {
        const cat = e.category_id ? categoryById.get(e.category_id) : undefined;
        const hay = `${e.description} ${e.notes ?? ''} ${categoryLabel(cat, t)} ${e.currency}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const groups = new Map<string, Expense[]>();
    for (const e of filtered) {
      const d = dayKey(e.occurred_at, tz);
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(e);
    }
    return [...groups.entries()].map(([day, data]) => ({
      day,
      data,
      total: data.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount_ils_minor, 0),
    }));
  }, [expenses, query, categoryId, payerId, from, to, tz, categoryById, t]);

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
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
        <Text variant="title">{t('expenses.title')}</Text>
        <SyncStatus tripId={trip.id} />
        <Row gap={space.sm}>
          <Row gap={space.sm} style={{ flex: 1, backgroundColor: c.card, borderRadius: radius.md, paddingHorizontal: space.md }}>
            <Ionicons name="search" size={18} color={c.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('expenses.searchPlaceholder')}
              placeholderTextColor={c.textFaint}
              style={{ flex: 1, height: 44, fontSize: 16, color: c.text, textAlign: 'auto' }}
            />
            {query ? <Ionicons name="close-circle" size={18} color={c.textFaint} onPress={() => setQuery('')} /> : null}
          </Row>
          <Pressable
            onPress={() => setShowFilters((v) => !v)}
            style={{
              height: 44,
              paddingHorizontal: space.md,
              borderRadius: radius.md,
              backgroundColor: activeFilters ? c.primary : c.card,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="options-outline" size={20} color={activeFilters ? c.primaryText : c.text} />
            {activeFilters ? <Text variant="label" color={c.primaryText}>{activeFilters}</Text> : null}
          </Pressable>
        </Row>

        {showFilters ? (
          <View style={{ gap: space.sm }}>
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
                  icon={cat.icon}
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
                  }}
                />
              ) : null}
            </Row>
          </View>
        ) : null}
      </View>

      {data.isLoading ? (
        <Loading />
      ) : data.error ? (
        <ErrorView error={data.error} onRetry={data.refetch} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => e.id}
          stickySectionHeadersEnabled
          refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} />}
          contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}
          ListEmptyComponent={
            expenses.length === 0 ? (
              <EmptyState emoji="🧾" title={t('home.emptyTitle')} body={t('home.emptyBody')} />
            ) : (
              <EmptyState emoji="🔍" title={t('expenses.empty')} body={t('expenses.emptyBody')} />
            )
          }
          renderSectionHeader={({ section }) => (
            <Row style={{ justifyContent: 'space-between', paddingVertical: space.sm, backgroundColor: c.bg }}>
              <Text variant="label" muted>
                {dayTitle(section.day)}
              </Text>
              <Text variant="label" muted>
                {formatMoney(section.total, HOME_CURRENCY, { lang })}
              </Text>
            </Row>
          )}
          renderItem={({ item, index, section }) => (
            <SwipeableExpenseRow
              expense={item}
              first={index === 0}
              last={index === section.data.length - 1}
              category={item.category_id ? categoryById.get(item.category_id) : undefined}
              payer={memberById.get(item.paid_by_member_id ?? '')}
              recipient={memberById.get(item.expense_splits[0]?.member_id)}
              onOpen={() => actions.open(item)}
              onEdit={() => actions.edit(item)}
              onDelete={() => actions.remove(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
