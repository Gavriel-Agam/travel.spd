import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { readableOn } from '@/lib/contrast';
import { radius, space, useColors } from '@/theme';
import type { Category, Expense, Member } from '@/types/db';
import { ExpenseRow } from './ExpenseRow';
import { Row } from './primitives';

/**
 * One row of a day group in the expense list. Swipe to reveal edit (blue) and
 * delete (red). The swipe area is clipped to the card's rounded shape and the
 * gap after a day sits outside it; otherwise those buttons peek out under the
 * row as red/blue strips.
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
}) {
  const c = useColors();
  const corners = {
    borderTopLeftRadius: first ? radius.lg : 0,
    borderTopRightRadius: first ? radius.lg : 0,
    borderBottomLeftRadius: last ? radius.lg : 0,
    borderBottomRightRadius: last ? radius.lg : 0,
  };
  return (
    <View style={{ marginBottom: last ? space.md : 0 }}>
      <Swipeable
        friction={2}
        rightThreshold={40}
        containerStyle={[corners, { overflow: 'hidden' }]}
        renderRightActions={(_p, _t, methods) => (
          <Row gap={0}>
            {expense.kind === 'expense' && !expense.pending ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  methods.close();
                  onEdit();
                }}
                style={{ width: 72, height: '100%', backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="create-outline" size={22} color={c.primaryText} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                methods.close();
                onDelete();
              }}
              style={{ width: 72, height: '100%', backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="trash-outline" size={22} color={readableOn(c.danger)} />
            </Pressable>
          </Row>
        )}
      >
        <View style={[corners, { backgroundColor: c.card, paddingHorizontal: space.md }]}>
          <ExpenseRow expense={expense} category={category} payer={payer} recipient={recipient} onPress={onOpen} />
        </View>
      </Swipeable>
    </View>
  );
}
