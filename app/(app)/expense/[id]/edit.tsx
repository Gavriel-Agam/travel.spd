import { useLocalSearchParams } from 'expo-router';
import { useTripData } from '@/hooks/useTripData';
import { useT } from '@/i18n';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { EmptyState, Loading, Screen } from '@/ui/primitives';

export default function EditExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const { isLoading, members, expenses } = useTripData();
  if (isLoading || members.length === 0) return <Loading />;
  const expense = expenses.find((e) => e.id === id);
  if (!expense)
    return (
      <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <EmptyState emoji="🫥" title={t('errors.not_found')} />
      </Screen>
    );
  // The form keeps the version it opened with, so a concurrent edit by the
  // partner surfaces as a conflict on save instead of silently replacing input
  return <ExpenseForm key={expense.id} existing={expense} />;
}
