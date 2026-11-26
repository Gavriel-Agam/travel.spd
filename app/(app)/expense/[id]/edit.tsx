import { useLocalSearchParams } from 'expo-router';
import { useTripData } from '@/hooks/useTripData';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { Loading } from '@/ui/primitives';
import { useEffect } from 'react';
import { goBack } from '@/lib/nav';

export default function EditExpense() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoading, members, allExpenses: expenses } = useTripData();
  const expense = expenses.find((e) => e.id === id);
  // Deleted meanwhile (here or by a partner): back to the list, no "not found" screen
  const gone = !isLoading && members.length > 0 && !expense;
  useEffect(() => {
    if (gone) goBack('/expenses');
  }, [gone]);
  if (isLoading || members.length === 0 || !expense) return <Loading />;
  // The form keeps the version it opened with, so a concurrent edit by the
  // partner surfaces as a conflict on save instead of silently replacing input
  return <ExpenseForm key={expense.id} existing={expense} />;
}
