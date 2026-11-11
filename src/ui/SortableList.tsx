import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, View, type ViewStyle } from 'react-native';
import { useT } from '@/i18n';
import { moveItem } from '@/lib/homeLayout';
import { radius, space, useColors } from '@/theme';
import { Text, tap } from './primitives';

export type SortableItem = { key: string; label: string; icon: string };

const ROW = 56;
const GAP = 8;
const STEP = ROW + GAP;

/**
 * Drag rows by their handle to reorder (touch or mouse), or use the arrows.
 * Built on PanResponder so it behaves the same in Safari and in the native app.
 */
export function SortableList({ items, onChange }: { items: SortableItem[]; onChange: (keys: string[]) => void }) {
  const [order, setOrder] = useState(() => items.map((i) => i.key));
  const [drag, setDrag] = useState<{ key: string; from: number; dy: number } | null>(null);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const n = order.length;

  useEffect(() => setOrder(items.map((i) => i.key)), [items.map((i) => i.key).join('|')]);

  const target = drag ? Math.max(0, Math.min(n - 1, Math.round((drag.from * STEP + drag.dy) / STEP))) : -1;

  // Latest values for the gesture callbacks, which are created once per row
  const live = useRef({ order, drag, target, onChange });
  live.current = { order, drag, target, onChange };

  const commit = (next: string[]) => {
    setOrder(next);
    live.current.onChange(next);
  };

  const handlers = {
    start: (key: string) => {
      tap();
      setDrag({ key, from: live.current.order.indexOf(key), dy: 0 });
    },
    move: (dy: number) => setDrag((d) => (d ? { ...d, dy } : d)),
    end: () => {
      const { drag: d, target: to, order: o } = live.current;
      setDrag(null);
      if (d && to >= 0 && to !== d.from) commit(moveItem(o, d.from, to));
    },
    step: (key: string, delta: number) => {
      const o = live.current.order;
      const from = o.indexOf(key);
      const to = from + delta;
      if (to < 0 || to >= o.length) return;
      tap();
      commit(moveItem(o, from, to));
    },
  };

  return (
    <View style={{ height: n * STEP - GAP, position: 'relative' }}>
      {order.map((key, i) => {
        let top = i * STEP;
        if (drag) {
          if (key === drag.key) top = Math.max(-STEP / 2, Math.min((n - 1) * STEP + STEP / 2, drag.from * STEP + drag.dy));
          else if (drag.from < i && i <= target) top = (i - 1) * STEP;
          else if (target <= i && i < drag.from) top = (i + 1) * STEP;
        }
        const item = byKey.get(key);
        if (!item) return null;
        return (
          <SortableRow
            key={key}
            item={item}
            top={top}
            active={drag?.key === key}
            first={i === 0}
            last={i === n - 1}
            handlers={handlers}
          />
        );
      })}
    </View>
  );
}

function SortableRow({
  item,
  top,
  active,
  first,
  last,
  handlers,
}: {
  item: SortableItem;
  top: number;
  active: boolean;
  first: boolean;
  last: boolean;
  handlers: { start: (k: string) => void; move: (dy: number) => void; end: () => void; step: (k: string, d: number) => void };
}) {
  const c = useColors();
  const { t } = useT();
  const h = useRef(handlers);
  h.current = handlers;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => h.current.start(item.key),
      onPanResponderMove: (_e, g) => h.current.move(g.dy),
      onPanResponderRelease: () => h.current.end(),
      onPanResponderTerminate: () => h.current.end(),
    }),
  ).current;

  // Stop the browser from scrolling or selecting text while the handle is dragged
  const webNoTouch = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none', cursor: 'grab' } : {}) as ViewStyle;

  return (
    <View
      style={{
        position: 'absolute',
        top,
        start: 0,
        end: 0,
        height: ROW,
        borderRadius: radius.md,
        backgroundColor: active ? c.primarySoft : c.cardAlt,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.sm,
        zIndex: active ? 10 : 1,
        shadowColor: '#000',
        shadowOpacity: active ? 0.25 : 0,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: active ? 6 : 0,
        transform: [{ scale: active ? 1.02 : 1 }],
      }}
    >
      <View
        {...pan.panHandlers}
        accessibilityLabel={t('home.dragHandle')}
        style={[{ width: 40, height: ROW, alignItems: 'center', justifyContent: 'center' }, webNoTouch]}
      >
        <Ionicons name="reorder-three" size={26} color={active ? c.primary : c.textMuted} />
      </View>
      <Text style={{ fontSize: 18 }}>{item.icon}</Text>
      <Text style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
        {item.label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.moveUp')}
        disabled={first}
        onPress={() => h.current.step(item.key, -1)}
        hitSlop={6}
        style={{ padding: 6, opacity: first ? 0.3 : 1 }}
      >
        <Ionicons name="chevron-up" size={20} color={c.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('home.moveDown')}
        disabled={last}
        onPress={() => h.current.step(item.key, 1)}
        hitSlop={6}
        style={{ padding: 6, opacity: last ? 0.3 : 1 }}
      >
        <Ionicons name="chevron-down" size={20} color={c.text} />
      </Pressable>
    </View>
  );
}
