import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { readableOn } from '@/lib/contrast';
import { ACTION_WIDTH, dragOffset, isHorizontalSwipe, settleOpen } from '@/lib/swipe';
import { radius, space, useColors } from '@/theme';
import type { Category, Expense, Member } from '@/types/db';
import { ExpenseRow } from './ExpenseRow';
import { Row } from './primitives';

// Action tiles: a little gap around each, so the reveal width stays ACTION_WIDTH per action
const TILE_INSET = 6;
const tile = {
  width: ACTION_WIDTH - TILE_INSET * 2,
  marginHorizontal: TILE_INSET,
  height: '100%',
  borderRadius: radius.md,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

// Only one row is open at a time. Each row registers a stable handle (not a
// per-render closure), so it can always be found again and removed on unmount.
type RowHandle = { close: () => void };
let openRow: RowHandle | null = null;

/**
 * One expense row (Expenses list, Home › Recent). Swipe towards the start to reveal
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
  const { t, lang } = useT();
  const rtl = lang === 'he';
  const canEdit = expense.kind === 'expense' && !expense.pending;
  const width = ACTION_WIDTH * (canEdit ? 2 : 1);
  const x = useRef(new Animated.Value(0)).current;
  const [revealed, setRevealed] = useState(false);
  const state = useRef({ base: 0, swipedAt: 0 });
  const live = useRef({ rtl, width });
  live.current = { rtl, width };

  const self = useRef<RowHandle>({ close: () => {} }).current;
  const mounted = useRef(true);

  const animateTo = (open: boolean) => {
    const to = open ? (live.current.rtl ? 1 : -1) * live.current.width : 0;
    state.current.base = to;
    if (open) {
      if (openRow && openRow !== self) openRow.close();
      openRow = self;
    } else if (openRow === self) openRow = null;
    Animated.spring(x, { toValue: to, useNativeDriver: Platform.OS !== 'web', bounciness: 0, speed: 20 }).start(({ finished }) => {
      if (finished && !open && mounted.current) setRevealed(false);
    });
  };
  const close = () => animateTo(false);
  self.close = close;

  useEffect(
    () => () => {
      mounted.current = false;
      if (openRow === self) openRow = null;
    },
    [],
  );

  // The buttons change (a pending expense syncs and gains Edit) or the language
  // flips while the row is open: slide to the new open position
  useEffect(() => {
    if (state.current.base !== 0) animateTo(true);
  }, [width, rtl]);

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
        {/* Always mounted so screen readers can reach them; only visible while the row is open */}
        {/* Each action is its own rounded tile (same on every row), inset from the row edges */}
        <Row gap={0} style={{ position: 'absolute', top: 0, bottom: 0, paddingVertical: TILE_INSET, opacity: revealed ? 1 : 0, ...(rtl ? { left: 0 } : { right: 0 }) }}>
          {canEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.edit')}
              onPress={act(onEdit)}
              style={({ pressed }) => [tile, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Ionicons name="create-outline" size={22} color={c.primaryText} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
            onPress={act(onDelete)}
            style={({ pressed }) => [tile, { backgroundColor: c.danger, opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name="trash-outline" size={22} color={readableOn(c.danger)} />
          </Pressable>
        </Row>
        <Animated.View
          {...pan.panHandlers}
          // Native screen readers: edit / delete without swiping
          accessibilityActions={[...(canEdit ? [{ name: 'edit', label: t('common.edit') }] : []), { name: 'delete', label: t('common.delete') }]}
          onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'edit' ? onEdit : onDelete)()}
          // Lets the browser keep vertical scrolling while sideways moves come to us,
          // and a mouse swipe moves the row instead of selecting its text
          style={[
            corners,
            { backgroundColor: c.card, paddingHorizontal: inset ? space.md : 0, transform: [{ translateX: x }] },
            Platform.OS === 'web' ? ({ touchAction: 'pan-y', userSelect: 'none' } as object) : null,
          ]}
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
