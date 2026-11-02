import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSetBudget } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { dailySeries, type BudgetStatus } from '@/lib/budget';
import { categoryLabel, UNCATEGORIZED } from '@/lib/categories';
import { HOME_CURRENCY } from '@/lib/currencies';
import { formatMoney, minorToInput, parseAmount } from '@/lib/money';
import { errorCode } from '@/lib/supabase';
import { dayKey, daysInclusive } from '@/lib/stats';
import { alertColor, space, useColors } from '@/theme';
import type { Budget as BudgetRecord } from '@/types/db';
import { BudgetAlertBanner } from '@/ui/BudgetAlert';
import { Sheet } from '@/ui/Sheet';
import { Avatar, Button, Card, Chip, Divider, Field, Loading, ProgressBar, Row, Screen, SectionHeader, Text } from '@/ui/primitives';

type Target = { scope: BudgetRecord['scope']; category_id?: string; member_id?: string; title: string };

export default function Budget() {
  const { t, lang } = useT();
  const c = useColors();
  const data = useTripData();
  const { trip, stats, budgets, budgetStatuses, categories, members, categoryById, memberById, expenses, isLoading } = data;
  const setBudget = useSetBudget(trip?.id ?? '');
  const [target, setTarget] = useState<Target | null>(null);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ils = (m: number) => formatMoney(m, HOME_CURRENCY, { lang });

  const series = useMemo(
    () =>
      trip && stats
        ? dailySeries({
            expenses,
            timeZone: trip.timezone,
            now: new Date(),
            startDate: trip.start_date,
            endDate: trip.end_date,
            totalBudget: stats.budget,
          })
        : [],
    [trip, stats, expenses],
  );

  if (!trip) return null;
  if (isLoading || !stats) return <Loading />;

  const statusOf = (scope: string, key: string) => budgetStatuses.find((s) => s.scope === scope && s.key === key);
  const amountOf = (tg: Target) =>
    budgets.find(
      (b) => b.scope === tg.scope && (b.category_id ?? undefined) === tg.category_id && (b.member_id ?? undefined) === tg.member_id,
    )?.amount_ils_minor ?? null;

  function open(tg: Target) {
    const current = amountOf(tg);
    setValue(current ? minorToInput(current, HOME_CURRENCY) : '');
    setError(null);
    setPickingCategory(false);
    setTarget(tg);
  }

  async function submit(remove = false) {
    if (!target) return;
    const amount = remove || !value.trim() ? null : parseAmount(value, HOME_CURRENCY);
    if (!remove && value.trim() && amount == null) return setError(t('errors.invalid_amount'));
    try {
      await setBudget.mutateAsync({ scope: target.scope, amount, category_id: target.category_id, member_id: target.member_id });
      setTarget(null);
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    }
  }

  // Pace: compare spending so far with an even spread of the budget over the trip
  const today = dayKey(new Date(), trip.timezone);
  const last = series[series.length - 1];
  const paceDiff = last?.pace != null ? last.cumulative - last.pace : null;
  const daysLeft = trip.end_date && trip.end_date >= today ? daysInclusive(today, trip.end_date) : null;
  const perDayLeft = stats.remaining != null && daysLeft ? Math.max(0, Math.floor(stats.remaining / daysLeft)) : null;

  const categoryBudgets = budgetStatuses.filter((s) => s.scope === 'category');
  const unbudgeted = categories.filter((cat) => !categoryBudgets.some((s) => s.key === cat.id));

  return (
    <Screen refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={data.refetch} />}>
      <Text variant="title">{t('budget.title')}</Text>
      <BudgetAlertBanner status={data.topAlert} categories={categoryById} members={memberById} />

      {/* Total + daily */}
      <Card>
        <BudgetLine
          title={t('budget.total')}
          status={statusOf('total', 'total')}
          onPress={() => open({ scope: 'total', title: t('budget.total') })}
          ils={ils}
        />
        {stats.budget ? (
          <View style={{ gap: 6 }}>
            {paceDiff != null ? (
              <Row gap={6}>
                <Ionicons name={paceDiff > 0 ? 'trending-up' : 'checkmark-circle'} size={16} color={paceDiff > 0 ? c.warning : c.success} />
                <Text variant="caption" color={paceDiff > 0 ? c.warning : c.success}>
                  {paceDiff > 0 ? t('budget.aheadOfPace', { amount: ils(paceDiff) }) : t('budget.onPace', { amount: ils(-paceDiff) })}
                </Text>
              </Row>
            ) : null}
            {perDayLeft != null ? (
              <Text variant="caption" muted>
                {t('budget.perDayLeft', { amount: ils(perDayLeft), days: daysLeft })}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Divider />
        <BudgetLine
          title={t('budget.daily')}
          subtitle={t('common.today')}
          status={statusOf('daily', 'daily')}
          onPress={() => open({ scope: 'daily', title: t('budget.daily') })}
          ils={ils}
        />
      </Card>

      {/* Projection */}
      <Card>
        <SectionHeader title={t('budget.projection')} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text muted>{t('home.dailyAvg')}</Text>
          <Text variant="mono">{ils(stats.dailyAverage)}</Text>
        </Row>
        {stats.projected != null ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text muted>{t('home.projected')}</Text>
            <Text variant="mono" color={stats.budget && stats.projected > stats.budget ? c.danger : c.text}>
              {ils(stats.projected)}
            </Text>
          </Row>
        ) : (
          <Text variant="caption" muted>
            {t('budget.projectionNeedsDates')}
          </Text>
        )}
        {stats.projected != null && stats.budget ? (
          <Text variant="caption" muted>
            {stats.projected > stats.budget
              ? t('budget.projectedOver', { amount: ils(stats.projected - stats.budget) })
              : t('budget.projectedUnder', { amount: ils(stats.budget - stats.projected) })}
          </Text>
        ) : null}
      </Card>

      {/* Categories */}
      <Card>
        <SectionHeader title={t('budget.byCategory')} action={unbudgeted.length ? t('budget.add') : undefined} onAction={() => setPickingCategory(true)} />
        {categoryBudgets.length === 0 ? (
          <Text variant="caption" muted>
            {t('budget.noCategoryBudgets')}
          </Text>
        ) : (
          categoryBudgets.map((s, i) => {
            const cat = categoryById.get(s.key);
            return (
              <View key={s.key} style={{ gap: space.sm }}>
                {i > 0 ? <Divider /> : null}
                <BudgetLine
                  icon={cat?.icon ?? UNCATEGORIZED.icon}
                  title={categoryLabel(cat, t)}
                  status={s}
                  onPress={() => open({ scope: 'category', category_id: s.key, title: categoryLabel(cat, t) })}
                  ils={ils}
                />
              </View>
            );
          })
        )}
      </Card>

      {/* Personal limits */}
      {members.length > 1 ? (
        <Card>
          <SectionHeader title={t('budget.personal')} />
          <Text variant="caption" muted>
            {t('budget.personalHint')}
          </Text>
          {members.map((m, i) => (
            <View key={m.id} style={{ gap: space.sm }}>
              {i > 0 ? <Divider /> : null}
              <BudgetLine
                avatar={<Avatar name={m.display_name} color={m.color} size={28} />}
                title={m.display_name}
                status={statusOf('member', m.id)}
                onPress={() => open({ scope: 'member', member_id: m.id, title: t('budget.personalOf', { name: m.display_name }) })}
                ils={ils}
              />
            </View>
          ))}
        </Card>
      ) : null}

      {/* Choose a category to budget */}
      <Sheet visible={pickingCategory} onClose={() => setPickingCategory(false)} title={t('budget.chooseCategory')}>
        <View style={{ padding: space.lg, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {unbudgeted.map((cat) => (
            <Chip
              key={cat.id}
              icon={cat.icon}
              label={categoryLabel(cat, t)}
              onPress={() => open({ scope: 'category', category_id: cat.id, title: categoryLabel(cat, t) })}
            />
          ))}
        </View>
      </Sheet>

      {/* Edit amount */}
      <Sheet visible={!!target} onClose={() => setTarget(null)} title={target ? t('budget.editTitle', { name: target.title }) : ''}>
        <View style={{ padding: space.lg, gap: space.md }}>
          <Field value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0 ₪" autoFocus error={error} />
          <Button title={t('common.save')} onPress={() => submit()} loading={setBudget.isPending} />
          {target && amountOf(target) ? <Button title={t('budget.remove')} variant="danger" onPress={() => submit(true)} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}

function BudgetLine({
  title,
  subtitle,
  icon,
  avatar,
  status,
  onPress,
  ils,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  avatar?: ReactNode;
  status?: BudgetStatus;
  onPress: () => void;
  ils: (m: number) => string;
}) {
  const { t } = useT();
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ gap: 6, opacity: pressed ? 0.7 : 1 })}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={space.sm} style={{ flex: 1 }}>
          {avatar ?? (icon ? <Text style={{ fontSize: 18 }}>{icon}</Text> : null)}
          <Text variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" muted>
              {subtitle}
            </Text>
          ) : null}
        </Row>
        <Text variant="label" color={c.primary}>
          {status ? ils(status.limit) : t('budget.set')}
        </Text>
      </Row>
      {status ? (
        <>
          <ProgressBar value={status.pct} color={alertColor(c, status.alert)} height={8} />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="caption" muted>
              {ils(status.spent)} · {status.pct}%
            </Text>
            <Text variant="caption" color={status.remaining < 0 ? c.danger : c.textMuted}>
              {status.remaining >= 0 ? t('home.remaining', { amount: ils(status.remaining) }) : t('home.over', { amount: ils(-status.remaining) })}
            </Text>
          </Row>
        </>
      ) : null}
    </Pressable>
  );
}
