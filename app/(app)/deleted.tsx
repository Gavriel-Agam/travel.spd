import { useMemo } from 'react';
import { View } from 'react-native';
import { RESTORE_DAYS, useDeletedExpenses, useRestoreExpense } from '@/api/queries';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { goBack } from '@/lib/nav';
import { useOutbox, type DeleteItem } from '@/store/outbox';
import { space } from '@/theme';
import type { Expense } from '@/types/db';
import { ExpenseRow } from '@/ui/ExpenseRow';
import { Button, Card, Divider, EmptyState, ErrorView, IconButton, Loading, Row, Screen, Text } from '@/ui/primitives';
import { Topbar } from '@/ui/Topbar';

/** Days until a deleted expense is removed for good (at least 0). */
function daysLeft(deletedAt: string | null | undefined, now = Date.now()) {
  const at = deletedAt ? Date.parse(deletedAt) : now;
  return Math.max(0, Math.ceil((at + RESTORE_DAYS * 86_400_000 - now) / 86_400_000));
}

/**
 * Recently deleted: the trip's expenses deleted in the last 30 days (also ones
 * deleted on this phone and not sent yet), each with Restore. Restoring shows
 * the expense again at once; offline it is sent when the connection returns.
 */
export default function RecentlyDeleted() {
  const { t, lang } = useT();
  const { trip, memberById, categoryById } = useTripData();
  const deleted = useDeletedExpenses(trip?.id);
  const restore = useRestoreExpense(trip?.id ?? '');
  const outbox = useOutbox((s) => s.items);

  const list = useMemo(() => {
    if (!trip) return [] as Expense[];
    const restoring = new Set(outbox.filter((i) => i.tripId === trip.id && i.kind === 'restore').map((i) => (i as { expenseId: string }).expenseId));
    // Deleted on this phone, not on the server yet
    const local = outbox
      .filter((i): i is DeleteItem => i.tripId === trip.id && i.kind === 'delete' && !!i.snapshot && !i.error)
      .map((i) => ({ ...i.snapshot!, deleted_at: i.queuedAt }));
    const server = deleted.data ?? [];
    const ids = new Set(server.map((e) => e.id));
    return [...local.filter((e) => !ids.has(e.id)), ...server]
      .filter((e) => !restoring.has(e.id))
      .sort((a, b) => ((a.deleted_at ?? '') < (b.deleted_at ?? '') ? 1 : -1));
  }, [trip, outbox, deleted.data]);

  if (!trip) return null;

  return (
    <Screen>
      <Topbar title={t('deleted.title')} onBack={() => goBack('/expenses')} />
      <Text variant="caption" muted>
        {t('deleted.hint', { days: RESTORE_DAYS })}
      </Text>
      {deleted.isLoading && !list.length ? (
        <Loading />
      ) : deleted.error && !list.length ? (
        <ErrorView error={deleted.error} onRetry={deleted.refetch} />
      ) : !list.length ? (
        <Card>
          <EmptyState emoji="🗑️" title={t('deleted.empty')} body={t('deleted.emptyBody')} />
        </Card>
      ) : (
        <Card style={{ gap: 0 }}>
          {list.map((e, i) => (
            <View key={e.id} style={{ gap: space.xs, paddingVertical: space.sm }}>
              {i > 0 ? <Divider /> : null}
              <ExpenseRow
                expense={{ ...e, pending: undefined }}
                category={e.category_id ? categoryById.get(e.category_id) : undefined}
                payer={e.paid_by_member_id ? memberById.get(e.paid_by_member_id) : undefined}
              />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" muted style={{ flex: 1 }}>
                  {t('deleted.daysLeft', { count: daysLeft(e.deleted_at) })}
                </Text>
                <Button title={t('deleted.restore')} icon="arrow-undo-outline" variant="secondary" onPress={() => restore(e)} style={{ height: 40 }} />
              </Row>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
