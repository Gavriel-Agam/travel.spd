import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PanResponder, Platform, View, useWindowDimensions, type ScrollViewInstance, type ViewInstance } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect as SvgRect } from 'react-native-svg';
import {
  autoScrollArmed,
  autoScrollSpeed,
  columnCount,
  dropPlacement,
  dropTarget,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  moveItem,
  nextScroll,
  splitColumns,
  type Rect,
} from '@/lib/homeLayout';
import { radius as radii, space, useColors } from '@/theme';
import { tap } from './primitives';

export type GridItem = { key: string; node: ReactNode; /** Corner radius of the card, for the lifted shadow. */ radius?: number };

/** `to`: new index if dropped now (-1: no change); the line goes on `lineKey`'s `side`. */
type Drag = { key: string; from: number; dx: number; dy: number; to: number; lineKey: string | null; side: 'before' | 'after' | null };

const LIFT_SCALE = 1.05;
const web = Platform.OS === 'web';

/**
 * Home cards that can be reordered in place: hold a card for half a second to
 * lift it, then drag it to its new spot, in either column. While lifted, a faint
 * grid shows behind the cards and an accent line marks where it will land. Near
 * the top or bottom of the screen the page scrolls along. A short touch or a
 * scroll never picks a card up, so buttons inside the cards keep working.
 * Screen readers use the Arrange sheet instead.
 */
export function DraggableGrid({
  items,
  onReorder,
  scrollRef,
  scroll,
  onDragging,
  columns: fixedColumns,
  gap = space.lg,
}: {
  items: GridItem[];
  onReorder: (keys: string[]) => void;
  scrollRef: RefObject<ScrollViewInstance | null>;
  /** The page's scroll offset and how far it can scroll, kept up to date by the screen. */
  scroll: RefObject<{ y: number; max: number }>;
  onDragging: (dragging: boolean) => void;
  /** Fixed number of columns (a list: 1); by default it follows the screen width. */
  columns?: number;
  /** Space between cards. */
  gap?: number;
}) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const cols = fixedColumns ?? columnCount(width);
  const keys = items.map((i) => i.key);
  const columns = splitColumns(items, cols);

  // Card positions on screen, measured when a card is lifted. (onLayout is not
  // enough: in the browser it only fires when a card's size changes, so after a
  // reorder the old positions would stay.)
  const views = useRef(new Map<string, ViewInstance | null>());
  const rects = useRef<Record<string, Rect>>({});
  const measuredAt = useRef(0);
  // The grid itself, measured with the cards: the drop line is placed relative to it
  const gridRef = useRef<ViewInstance | null>(null);
  const gridRect = useRef<Rect | null>(null);
  const measureAll = () => {
    rects.current = {};
    measuredAt.current = scroll.current.y;
    const all: [string, ViewInstance | null][] = [['__grid', gridRef.current], ...views.current];
    for (const [key, v] of all) {
      const el = v as unknown as { getBoundingClientRect?: () => DOMRect } | null;
      if (el?.getBoundingClientRect) {
        const b = el.getBoundingClientRect();
        rects.current[key] = { x: b.x, y: b.y, width: b.width, height: b.height };
      } else v?.measureInWindow((x, y, w, h) => (rects.current[key] = { x, y, width: w, height: h }));
    }
  };
  // Positions as they are now: the page may have scrolled since they were measured
  const rectOf = (key: string): Rect | undefined => {
    const r = rects.current[key];
    return r ? { ...r, y: r.y - (scroll.current.y - measuredAt.current) } : undefined;
  };

  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef({ keys, onReorder, onDragging, height });
  live.current = { keys, onReorder, onDragging, height };
  const gesture = useRef({
    key: '',
    from: -1,
    startScroll: 0,
    dx: 0,
    dy: 0,
    pageX: 0,
    pageY: 0,
    /** Auto-scroll allowed (the card has really moved) */
    armed: false,
    /** The card is lifted (long-press fired) */
    active: false,
    /** We own the touch (the finger moved after lifting) */
    granted: false,
    timer: 0 as unknown as ReturnType<typeof setTimeout>,
    raf: 0,
    last: 0,
  });

  // Where the lifted card is now, computed from the gesture itself
  const current = (): Drag => {
    const g = gesture.current;
    const dy = g.dy + (scroll.current.y - g.startScroll);
    const ks = live.current.keys;
    const hit = dropTarget(ks.map(rectOf), g.pageX, g.pageY);
    const r = hit >= 0 ? rectOf(ks[hit]) : undefined;
    const place = r ? dropPlacement(g.from, hit, g.pageY < r.y + r.height / 2) : null;
    return { key: g.key, from: g.from, dx: g.dx, dy, to: place ? place.to : -1, lineKey: place ? ks[hit] : null, side: place?.side ?? null };
  };
  const update = () => setDrag(current());

  // Scroll the page while the card is held near the top or bottom edge
  const tick = (now: number) => {
    const g = gesture.current;
    const frames = g.last ? Math.min(6, (now - g.last) / (1000 / 60)) : 1;
    g.last = now;
    const speed = g.armed ? autoScrollSpeed(g.pageY, 70, live.current.height - 110) * frames : 0;
    const y = nextScroll(scroll.current.y, speed, scroll.current.max);
    if (y !== scroll.current.y) {
      scrollRef.current?.scrollTo({ y, animated: false });
      scroll.current.y = y;
      update();
    }
    g.raf = requestAnimationFrame(tick);
  };

  const lift = (key: string) => {
    const g = gesture.current;
    tap();
    Object.assign(g, { key, from: live.current.keys.indexOf(key), startScroll: scroll.current.y, dx: 0, dy: 0, armed: false, active: true, granted: false, last: 0 });
    measureAll();
    live.current.onDragging(true);
    update();
    g.raf = requestAnimationFrame(tick);
  };

  const end = (commit: boolean) => {
    const g = gesture.current;
    clearTimeout(g.timer);
    if (!g.active) return;
    cancelAnimationFrame(g.raf);
    const d = current();
    Object.assign(g, { active: false, granted: false });
    setDrag(null);
    live.current.onDragging(false);
    if (commit && d.to >= 0) {
      tap();
      live.current.onReorder(moveItem(live.current.keys, d.from, d.to));
    }
  };

  // Finger lifted before it moved: put the card back (and drop any pending long-press)
  const release = () => {
    clearTimeout(gesture.current.timer);
    if (gesture.current.active && !gesture.current.granted) end(false);
  };

  const responders = useMemo(() => {
    const make = (key: string) =>
      PanResponder.create({
        // Every touch on a card starts the long-press timer, but never takes the
        // touch: taps, buttons and scrolling inside the card work as usual
        onStartShouldSetPanResponderCapture: (e) => {
          const g = gesture.current;
          if (g.active) return false;
          clearTimeout(g.timer);
          g.pageX = e.nativeEvent.pageX;
          g.pageY = e.nativeEvent.pageY;
          g.timer = setTimeout(() => lift(key), LONG_PRESS_MS);
          return false;
        },
        // Once lifted, the first move takes the touch over; moving before that is a scroll
        onMoveShouldSetPanResponderCapture: (_e, s) => {
          const g = gesture.current;
          if (g.active && g.key === key) return true;
          if (Math.hypot(s.dx, s.dy) > LONG_PRESS_SLOP) clearTimeout(g.timer);
          return false;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          gesture.current.granted = true;
        },
        onPanResponderMove: (_e, s) => {
          const g = gesture.current;
          const armed = g.armed || autoScrollArmed(s.dx, s.dy);
          Object.assign(g, { dx: s.dx, dy: s.dy, pageX: s.moveX, pageY: s.moveY, armed });
          update();
        },
        onPanResponderRelease: () => end(true),
        onPanResponderTerminate: () => end(false),
      });
    return new Map(keys.map((k) => [k, make(k)]));
    // One responder per card; the callbacks read the latest values from refs
  }, [keys.join('|')]);

  // Browser: a release anywhere ends a pending long-press, and while a card is
  // lifted the page must not scroll under the finger (iOS Safari ignores
  // overflow changes mid-touch, so the touch move itself is cancelled)
  useEffect(() => {
    if (!web) return;
    const onMove = (e: TouchEvent) => gesture.current.active && e.cancelable && e.preventDefault();
    const onMenu = (e: Event) => gesture.current.active && e.preventDefault();
    const ups = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'] as const;
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('contextmenu', onMenu);
    ups.forEach((u) => window.addEventListener(u, release));
    return () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('contextmenu', onMenu);
      ups.forEach((u) => window.removeEventListener(u, release));
    };
  }, []);

  useEffect(
    () => () => {
      clearTimeout(gesture.current.timer);
      cancelAnimationFrame(gesture.current.raf);
    },
    [],
  );

  // Drop line: in the gap before / after the card under the finger, drawn above
  // everything (the lifted card would otherwise cover it). Card and grid were
  // measured together, so scrolling since then doesn't matter.
  const lineRect = drag?.lineKey ? rects.current[drag.lineKey] : undefined;
  const grid = rects.current.__grid;
  const line =
    lineRect && grid
      ? {
          left: lineRect.x - grid.x + space.sm,
          width: lineRect.width - space.sm * 2,
          top: (drag!.side === 'before' ? lineRect.y - gap / 2 : lineRect.y + lineRect.height + gap / 2) - grid.y - 2,
        }
      : null;

  return (
    // 'row' already runs right to left in Hebrew
    <View ref={gridRef} style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
      {/* Drag mode: a faint grid behind the cards */}
      {drag ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -space.sm, bottom: -space.sm, left: -space.sm, right: -space.sm, borderRadius: radii.lg, overflow: 'hidden' }}>
          <Svg width="100%" height="100%">
            <Defs>
              <Pattern id="dragGrid" width={24} height={24} patternUnits="userSpaceOnUse">
                <Path d="M 24 0 L 0 0 0 24" fill="none" stroke={c.primary} strokeOpacity={0.14} strokeWidth={1} />
              </Pattern>
            </Defs>
            <SvgRect width="100%" height="100%" fill={c.primary} fillOpacity={0.04} />
            <SvgRect width="100%" height="100%" fill="url(#dragGrid)" />
          </Svg>
        </View>
      ) : null}
      {columns.map((colItems, col) => (
        <View key={col} style={{ flex: 1, gap, zIndex: drag && colItems.some((i) => i.key === drag.key) ? 10 : 0 }}>
          {colItems.map((item) => {
            const lifted = drag?.key === item.key;
            return (
              <View
                key={item.key}
                ref={(v) => {
                  views.current.set(item.key, v);
                  return () => {
                    views.current.delete(item.key);
                  };
                }}
                {...responders.get(item.key)?.panHandlers}
                onTouchEnd={release}
                onTouchCancel={release}
                style={[
                  { position: 'relative', borderRadius: item.radius ?? radii.lg },
                  // No text selection or iOS callout on a long-press
                  web ? ({ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: lifted ? 'grabbing' : undefined } as object) : null,
                  lifted
                    ? {
                        zIndex: 20,
                        transform: [{ translateX: drag.dx }, { translateY: drag.dy }, { scale: LIFT_SCALE }],
                        boxShadow: '0 22px 44px rgba(0,0,0,0.45), 0 6px 14px rgba(0,0,0,0.25)',
                      }
                    : null,
                ]}
              >
                {item.node}
              </View>
            );
          })}
        </View>
      ))}
      {/* Where the card will land */}
      {line ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            ...line,
            height: 4,
            borderRadius: 2,
            zIndex: 50,
            backgroundColor: c.primary,
            boxShadow: `0 0 0 2px ${c.bg}, 0 0 12px ${c.primary}`,
          }}
        />
      ) : null}
    </View>
  );
}
