import { useTripData } from '@/hooks/useTripData';
import { ExpenseForm } from '@/ui/ExpenseForm';
import { Loading } from '@/ui/primitives';

export default function NewExpense() {
  const { isLoading, members } = useTripData();
  // The form seeds payer and split from the member list, so wait for it
  if (isLoading || members.length === 0) return <Loading />;
  return <ExpenseForm />;
}
