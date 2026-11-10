import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, Pressable, View, type ViewStyle } from 'react-native';
import { useT } from '@/i18n';
import { readableOn } from '@/lib/contrast';
import { ACTION_WIDTH, dragOffset, isHorizontalSwipe, settleOpen } from '@/lib/swipe';
import { radius } from '@/theme';
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

// Only one row is open at a time (across every list). Each row registers a
// stable handle (not a per-render closure), so it can always be found again
// and removed on unmount.
type RowHandle = { close: () => void };
let openRow: RowHandle | null = null;

const CORNER_KEYS = ['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'] as const;
/** The sliding part keeps the row's rounded corners. */
function corners(style?: ViewStyle): ViewStyle {
  const out: Record<string, unknown> = {};
  for (const k of CORNER_KEYS) if (style?.[k] != null) out[k] = style[k];
  return out as ViewStyle;
}

export type SwipeAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** Screen reader name (and native accessibility action). */
  label: string;
  onPress: () => void;
};

/**
 * A list row that slides towards the start to reveal action tiles (left in
 * English, right in Hebrew: swipe right). A swipe never counts as a tap, and
 * the tiles are only drawn while the row is open, so nothing peeks out at the
 * edges. `children` gets `guardTap`, which turns a tap that ends a swipe (or
 * lands on an open row) into closing the row.
 */
export function SwipeRow({
  actions,
  children,
  background,
  style,
  contentStyle,
}: {
  actions: SwipeAction[];
  children: (guardTap: (onTap: () => void) => () => void) => ReactNode;
  /** Behind the sliding content (the row's own card colour). */
  background: string;
  /** Outer box: corners, margins. */
  style?: ViewStyle;
  /** The sliding part: padding. */
  contentStyle?: ViewStyle;
}) {
  const { lang } = useT();
  const rtl = lang === 'he';
  const width = ACTION_WIDTH * actions.length;
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

  // The actions change (a pending expense syncs and gains Edit) or the language
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

  const guardTap = (onTap: () => void) => () => {
    // The end of a swipe is not a tap; a tap on an open row just closes it
    if (Date.now() - state.current.swipedAt < 400) return;
    if (state.current.base !== 0) return close();
    onTap();
  };

  const act = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: background }, style]}>
      {/* Always mounted so screen readers can reach them; only visible while the row is open */}
      <Row
        gap={0}
        style={{ position: 'absolute', top: 0, bottom: 0, paddingVertical: TILE_INSET, opacity: revealed ? 1 : 0, ...(rtl ? { left: 0 } : { right: 0 }) }}
      >
        {actions.map((a) => (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={act(a.onPress)}
            style={({ pressed }) => [tile, { backgroundColor: a.color, opacity: pressed ? 0.85 : 1 }]}
          >
            <Ionicons name={a.icon} size={22} color={readableOn(a.color)} />
          </Pressable>
        ))}
      </Row>
      <Animated.View
        {...pan.panHandlers}
        // Native screen readers: the actions without swiping
        accessibilityActions={actions.map((a) => ({ name: a.key, label: a.label }))}
        onAccessibilityAction={(e) => actions.find((a) => a.key === e.nativeEvent.actionName)?.onPress()}
        // Lets the browser keep vertical scrolling while sideways moves come to us,
        // and a mouse swipe moves the row instead of selecting its text
        style={[
          { backgroundColor: background, transform: [{ translateX: x }] },
          corners(style),
          contentStyle,
          Platform.OS === 'web' ? ({ touchAction: 'pan-y', userSelect: 'none' } as object) : null,
        ]}
      >
        {children(guardTap)}
      </Animated.View>
    </View>
  );
}
