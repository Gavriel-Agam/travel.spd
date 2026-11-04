import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PanResponder, Platform, View, useWindowDimensions, type ScrollViewInstance } from 'react-native';
import { autoScrollSpeed, columnCount, dropTarget, moveItem, splitColumns, type Rect } from '@/lib/homeLayout';
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
  scrollY,
  onDragging,
  handleLabel,
}: {
  items: GridItem[];
  onReorder: (keys: string[]) => void;
  scrollRef: RefObject<ScrollViewInstance | null>;
  /** Current scroll offset of the page, kept up to date by the screen. */
  scrollY: RefObject<number>;
  onDragging: (dragging: boolean) => void;
  handleLabel: string;
}) {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const cols = columnCount(width);
  const keys = items.map((i) => i.key);
  const columns = splitColumns(items, cols);

  // Card positions inside the grid (column offset + position in the column)
  const colPos = useRef<Record<number, { x: number; y: number }>>({});
  const inCol = useRef<Record<string, Rect & { col: number }>>({});
  const rectOf = (key: string): Rect | undefined => {
    const r = inCol.current[key];
    const p = r && colPos.current[r.col];
    return r && p ? { x: p.x + r.x, y: p.y + r.y, width: r.width, height: r.height } : undefined;
  };

  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef({ keys, drag, onReorder, onDragging, height });
  live.current = { keys, drag, onReorder, onDragging, height };
  const gesture = useRef({ startScroll: 0, dx: 0, dy: 0, pageY: 0, raf: 0 });

  const update = (key: string, from: number) => {
    const g = gesture.current;
    const dy = g.dy + (scrollY.current - g.startScroll);
    const r = rectOf(key);
    // The card lands where the finger is (the handle is at the top centre of the card)
    const target = r ? dropTarget(live.current.keys.map(rectOf), r.x + r.width / 2 + g.dx, r.y + 8 + dy) : from;
    setDrag({ key, from, dx: g.dx, dy, target });
  };

  // Scroll the page while the card is held near the top or bottom edge
  const tick = (key: string, from: number) => {
    const g = gesture.current;
    const speed = autoScrollSpeed(g.pageY, 70, live.current.height - 110);
    if (speed !== 0) {
      const y = Math.max(0, scrollY.current + speed);
      scrollRef.current?.scrollTo({ y, animated: false });
      scrollY.current = y;
      update(key, from);
    }
    g.raf = requestAnimationFrame(() => tick(key, from));
  };

  const end = (commit: boolean) => {
    const d = live.current.drag;
    cancelAnimationFrame(gesture.current.raf);
    setDrag(null);
    live.current.onDragging(false);
    if (commit && d && d.target >= 0 && d.target !== d.from) {
      tap();
      live.current.onReorder(moveItem(live.current.keys, d.from, d.target));
    }
  };

  const responders = useMemo(() => {
    const make = (key: string) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_e, g) => {
          tap();
          const from = live.current.keys.indexOf(key);
          Object.assign(gesture.current, { startScroll: scrollY.current, dx: 0, dy: 0, pageY: g.y0 });
          live.current.onDragging(true);
          update(key, from);
          gesture.current.raf = requestAnimationFrame(() => tick(key, from));
        },
        onPanResponderMove: (_e, g) => {
          Object.assign(gesture.current, { dx: g.dx, dy: g.dy, pageY: g.moveY });
          update(key, live.current.keys.indexOf(key));
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
          onLayout={(e) => (colPos.current[col] = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y })}
          style={{ flex: 1, gap: space.lg, zIndex: drag && colItems.some((i) => i.key === drag.key) ? 10 : 0 }}
        >
          {colItems.map((item) => {
            const dragging = drag?.key === item.key;
            return (
              <View
                key={item.key}
                onLayout={(e) => (inCol.current[item.key] = { ...e.nativeEvent.layout, col })}
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
                    accessibilityRole="adjustable"
                    accessibilityLabel={handleLabel}
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
