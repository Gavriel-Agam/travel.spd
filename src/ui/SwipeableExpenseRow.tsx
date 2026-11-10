import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import type { Category, Expense, Member } from '@/types/db';
import { ExpenseRow } from './ExpenseRow';
import { SwipeRow } from './SwipeRow';

/**
 * One expense row (Expenses list, Home › Recent). Swipe towards the start to reveal
 * edit (blue) and delete (red): left in English, right in Hebrew.
 */
export function SwipeableExpenseRow({
  expense,
  first,
  last,
  category,
  payer,
  recipient,
  onOpen,
  onEdit,
  onDelete,
  inset = true,
}: {
  expense: Expense;
  first: boolean;
  last: boolean;
  category?: Category;
  payer?: Member;
  recipient?: Member;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Own side padding (the Expenses list); false inside a card that has its own (Home › Recent). */
  inset?: boolean;
}) {
  const c = useColors();
  const { t } = useT();
  // A new expense still on the phone can't be edited yet; one with a queued edit can
  const canEdit = expense.kind === 'expense' && (!expense.pending || expense.pending_op === 'update');

  return (
    <SwipeRow
      background={c.card}
      style={{
        marginBottom: last ? space.md : 0,
        borderTopLeftRadius: first ? radius.lg : 0,
        borderTopRightRadius: first ? radius.lg : 0,
        borderBottomLeftRadius: last ? radius.lg : 0,
        borderBottomRightRadius: last ? radius.lg : 0,
      }}
      contentStyle={{ paddingHorizontal: inset ? space.md : 0 }}
      actions={[
        ...(canEdit ? [{ key: 'edit', icon: 'create-outline' as const, color: c.primary, label: t('common.edit'), onPress: onEdit }] : []),
        { key: 'delete', icon: 'trash-outline', color: c.danger, label: t('common.delete'), onPress: onDelete },
      ]}
    >
      {(guardTap) => <ExpenseRow expense={expense} category={category} payer={payer} recipient={recipient} onPress={guardTap(onOpen)} />}
    </SwipeRow>
  );
}
