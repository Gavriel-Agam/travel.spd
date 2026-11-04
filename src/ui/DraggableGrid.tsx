import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PanResponder, Platform, View, useWindowDimensions, type ScrollViewInstance, type ViewInstance } from 'react-native';
import { autoScrollArmed, autoScrollSpeed, columnCount, dropTarget, moveItem, nextScroll, splitColumns, type Rect } from '@/lib/homeLayout';
import { radius, space, useColors } from '@/theme';
import { tap } from './primitives';

export type GridItem = { key: string; node: ReactNode; handleColor?: string };

type Drag = { key: string; from: number; dx: number; dy: number; target: number };

/**
 * Home cards that can be reordered in place: drag a card by its handle (⠿ at
 * the top) and drop it on another card's spot, in either column. Near the top
 * or bottom of the screen the page scrolls along. One column on phones, two on
 * wide screens.
 */
export function DraggableGrid({
  items,
  onReorder,
  scrollRef,
  scroll,
  onDragging,
  handleLabel,
  handleHint,
  moveEarlierLabel,
  moveLaterLabel,
}: {
  items: GridItem[];
  onReorder: (keys: string[]) => void;
  scrollRef: RefObject<ScrollViewInstance | null>;
  /** The page's scroll offset and how far it can scroll, kept up to date by the screen. */
  scroll: RefObject<{ y: number; max: number }>;
  onDragging: (dragging: boolean) => void;
  handleLabel: string;
  /** For screen readers, which can't drag: how else to move the card. */
  handleHint: string;
  moveEarlierLabel: string;
  moveLaterLabel: string;
}) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const cols = columnCount(width);
  const keys = items.map((i) => i.key);
  const columns = splitColumns(items, cols);

  // Card positions on screen, measured when a drag starts. (onLayout is not
  // enough: in the browser it only fires when a card's size changes, so after a
  // reorder the old positions would stay.)
  const views = useRef(new Map<string, ViewInstance | null>());
  const rects = useRef<Record<string, Rect>>({});
  const measuredAt = useRef(0);
  const measureAll = () => {
    rects.current = {};
    measuredAt.current = scroll.current.y;
    for (const [key, v] of views.current) {
      // In the browser the view is a DOM node and can be measured right away, so even
      // a quick flick has positions; the native measure answers a moment later
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
  const live = useRef({ keys, drag, onReorder, onDragging, height });
  live.current = { keys, drag, onReorder, onDragging, height };
  const gesture = useRef({ key: '', from: -1, startScroll: 0, dx: 0, dy: 0, pageX: 0, pageY: 0, armed: false, raf: 0, last: 0 });

  // Where the dragged card is now, computed from the gesture itself (never from
  // state that may not have rendered yet, e.g. on a quick flick)
  const current = (): Drag => {
    const g = gesture.current;
    const dy = g.dy + (scroll.current.y - g.startScroll);
    // The card lands where the finger is
    const hit = dropTarget(live.current.keys.map(rectOf), g.pageX, g.pageY);
    return { key: g.key, from: g.from, dx: g.dx, dy, target: hit < 0 ? g.from : hit };
  };
  const update = () => setDrag(current());

  // Scroll the page while the card is held near the top or bottom edge. The speed
  // is per 60 Hz frame, scaled by the real frame time so slow devices keep pace.
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

  const end = (commit: boolean) => {
    cancelAnimationFrame(gesture.current.raf);
    const d = current();
    setDrag(null);
    live.current.onDragging(false);
    if (commit && d.target >= 0 && d.target !== d.from) {
      tap();
      live.current.onReorder(moveItem(live.current.keys, d.from, d.target));
    }
  };

  // Screen readers can't drag: the handle offers "move earlier / later" instead
  const step = (key: string, delta: number) => {
    const ks = live.current.keys;
    const from = ks.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ks.length) return;
    tap();
    live.current.onReorder(moveItem(ks, from, to));
  };

  const responders = useMemo(() => {
    const make = (key: string) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_e, g) => {
          tap();
          const from = live.current.keys.indexOf(key);
          Object.assign(gesture.current, { key, from, startScroll: scroll.current.y, dx: 0, dy: 0, pageX: g.x0, pageY: g.y0, armed: false, last: 0 });
          measureAll();
          live.current.onDragging(true);
          update();
          gesture.current.raf = requestAnimationFrame(tick);
        },
        onPanResponderMove: (_e, g) => {
          const armed = gesture.current.armed || autoScrollArmed(g.dx, g.dy);
          Object.assign(gesture.current, { dx: g.dx, dy: g.dy, pageX: g.moveX, pageY: g.moveY, armed });
          update();
        },
        onPanResponderRelease: () => end(true),
        onPanResponderTerminate: () => end(false),
      });
    return new Map(keys.map((k) => [k, make(k)]));
    // One responder per card; the callbacks read the latest values from refs
  }, [keys.join('|')]);

  useEffect(() => () => cancelAnimationFrame(gesture.current.raf), []);

  const targetKey = drag && drag.target >= 0 && drag.target !== drag.from ? keys[drag.target] : null;

  return (
    // 'row' already runs right to left in Hebrew
    <View
      style={[
        { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
        // No text selection while a card is being dragged with the mouse
        Platform.OS === 'web' && drag ? ({ userSelect: 'none' } as object) : null,
      ]}
    >
      {columns.map((colItems, col) => (
        <View
          key={col}
          style={{ flex: 1, gap: space.lg, zIndex: drag && colItems.some((i) => i.key === drag.key) ? 10 : 0 }}
        >
          {colItems.map((item) => {
            const dragging = drag?.key === item.key;
            return (
              <View
                key={item.key}
                ref={(v) => {
                  views.current.set(item.key, v);
                  return () => {
                    views.current.delete(item.key);
                  };
                }}
                style={[
                  { position: 'relative' },
                  dragging
                    ? {
                        zIndex: 20,
                        opacity: 0.92,
                        transform: [{ translateX: drag.dx }, { translateY: drag.dy }, { scale: 1.02 }],
                        shadowColor: '#000',
                        shadowOpacity: 0.25,
                        shadowRadius: 18,
                        shadowOffset: { width: 0, height: 10 },
                        elevation: 12,
                      }
                    : null,
                ]}
              >
                {item.node}
                {/* Where the card will land */}
                {targetKey === item.key ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: -4,
                      bottom: -4,
                      left: -4,
                      right: -4,
                      borderRadius: radius.lg + 4,
                      borderWidth: 2,
                      borderStyle: 'dashed',
                      borderColor: c.primary,
                    }}
                  />
                ) : null}
                {/* The handle sits centred in the card's top padding. Its touch area is real
                    padding (64×32): browsers ignore hitSlop, and a finger needs room */}
                <View pointerEvents="box-none" style={{ position: 'absolute', top: -8, left: 0, right: 0, alignItems: 'center' }}>
                  <View
                    {...responders.get(item.key)?.panHandlers}
                    accessibilityRole="button"
                    accessibilityLabel={handleLabel}
                    accessibilityHint={handleHint}
                    accessibilityActions={[
                      { name: 'moveEarlier', label: moveEarlierLabel },
                      { name: 'moveLater', label: moveLaterLabel },
                    ]}
                    onAccessibilityAction={(e) => step(item.key, e.nativeEvent.actionName === 'moveEarlier' ? -1 : 1)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={[
                      { width: 64, height: 32, alignItems: 'center', justifyContent: 'center' },
                      Platform.OS === 'web' ? ({ touchAction: 'none', cursor: dragging ? 'grabbing' : 'grab' } as object) : null,
                    ]}
                  >
                    <MaterialCommunityIcons name="drag-horizontal" size={20} color={item.handleColor ?? c.textFaint} />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
