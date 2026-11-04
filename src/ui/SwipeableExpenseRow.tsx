import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { readableOn } from '@/lib/contrast';
import { ACTION_WIDTH, dragOffset, isHorizontalSwipe, settleOpen } from '@/lib/swipe';
import { radius, space, useColors } from '@/theme';
import type { Category, Expense, Member } from '@/types/db';
import { ExpenseRow } from './ExpenseRow';
import { Row } from './primitives';

// Only one row is open at a time
let closeOpenRow: (() => void) | null = null;

/**
 * One row of a day group in the expense list. Swipe towards the start to reveal
 * edit (blue) and delete (red): left in English, right in Hebrew. A swipe never
 * counts as a tap, and the buttons are only drawn while the row is open, so
 * nothing peeks out at the edges.
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
  const rtl = useT().lang === 'he';
  const canEdit = expense.kind === 'expense' && !expense.pending;
  const width = ACTION_WIDTH * (canEdit ? 2 : 1);
  const x = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);
  const state = useRef({ base: 0, swipedAt: 0 });
  const live = useRef({ rtl, width });
  live.current = { rtl, width };

  const animateTo = (open: boolean) => {
    const to = open ? (live.current.rtl ? 1 : -1) * live.current.width : 0;
    state.current.base = to;
    if (open) {
      if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
      closeOpenRow = close;
    } else if (closeOpenRow === close) closeOpenRow = null;
    Animated.spring(x, { toValue: to, useNativeDriver: Platform.OS !== 'web', bounciness: 0, speed: 20 }).start(({ finished }) => {
      if (finished && !open) setRevealed(false);
    });
  };
  const close = () => animateTo(false);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Take over from the row's tap as soon as the finger clearly moves sideways
        onMoveShouldSetPanResponderCapture: (_e, g) => isHorizontalSwipe(g.dx, g.dy),
        onPanResponderGrant: () => {
          x.stopAnimation();
          setRevealed(true);
        },
        onPanResponderMove: (_e, g) => x.setValue(dragOffset(state.current.base, g.dx, live.current.width, live.current.rtl)),
        onPanResponderRelease: (_e, g) => {
          state.current.swipedAt = Date.now();
          animateTo(settleOpen(state.current.base, g.dx, g.vx, live.current.width, live.current.rtl));
        },
        onPanResponderTerminate: () => animateTo(state.current.base !== 0),
        onPanResponderTerminationRequest: () => false,
      }),
    // Created once; the callbacks read the latest values from refs
    [],
  );

  const corners = {
    borderTopLeftRadius: first ? radius.lg : 0,
    borderTopRightRadius: first ? radius.lg : 0,
    borderBottomLeftRadius: last ? radius.lg : 0,
    borderBottomRightRadius: last ? radius.lg : 0,
  };

  const act = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <View style={{ marginBottom: last ? space.md : 0 }}>
      <View style={[corners, { overflow: 'hidden', backgroundColor: c.card }]}>
        {revealed ? (
          <Row gap={0} style={{ position: 'absolute', top: 0, bottom: 0, ...(rtl ? { left: 0 } : { right: 0 }) }}>
            {canEdit ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit"
                onPress={act(onEdit)}
                style={{ width: ACTION_WIDTH, height: '100%', backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="create-outline" size={22} color={c.primaryText} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete"
              onPress={act(onDelete)}
              style={{ width: ACTION_WIDTH, height: '100%', backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="trash-outline" size={22} color={readableOn(c.danger)} />
            </Pressable>
          </Row>
        ) : null}
        <Animated.View
          {...pan.panHandlers}
          // Lets the browser keep vertical scrolling while sideways moves come to us
          style={[corners, { backgroundColor: c.card, paddingHorizontal: space.md, transform: [{ translateX: x }] }, Platform.OS === 'web' ? ({ touchAction: 'pan-y' } as object) : null]}
        >
          <ExpenseRow
            expense={expense}
            category={category}
            payer={payer}
            recipient={recipient}
            onPress={() => {
              // The end of a swipe is not a tap; a tap on an open row just closes it
              if (Date.now() - state.current.swipedAt < 400) return;
              if (state.current.base !== 0) return close();
              onOpen();
            }}
          />
        </Animated.View>
      </View>
    </View>
  );
}
