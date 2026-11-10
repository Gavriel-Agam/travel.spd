import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Platform, View, type ViewInstance } from 'react-native';
import { useT } from '@/i18n';
import { dropPlacement, dropTarget, LONG_PRESS_MS, LONG_PRESS_SLOP, moveItem, type Rect } from '@/lib/homeLayout';
import { useColors } from '@/theme';
import { tap } from './primitives';

export type ChipItem = { key: string; node: ReactNode };

type Drag = { key: string; dx: number; dy: number; to: number; lineKey: string | null; side: 'before' | 'after' | null };

const GAP = 8;
const web = Platform.OS === 'web';

/**
 * Chips that wrap over several lines and can be rearranged: hold one for half
 * a second to lift it, drag it, and let go; an accent bar shows where it will
 * land. A short tap still selects the chip and a quick move still scrolls, so
 * the chips keep working as a picker. Chips should pass `onLongPress` (a no-op
 * is enough) so the hold that lifts them doesn't also count as a tap.
 */
export function ReorderChips({ items, onReorder, onDragging }: {
  items: ChipItem[];
  onReorder: (keys: string[]) => void;
  /** While a chip is held: the screen should stop scrolling. */
  onDragging?: (dragging: boolean) => void;
}) {
  const c = useColors();
  const { lang } = useT();
  const rtl = lang === 'he';
  const keys = items.map((i) => i.key);

  const views = useRef(new Map<string, ViewInstance | null>());
  const boxRef = useRef<ViewInstance | null>(null);
  const rects = useRef<Record<string, Rect>>({});
  const measure = () => {
    rects.current = {};
    const all: [string, ViewInstance | null][] = [['__box', boxRef.current], ...views.current];
    for (const [key, v] of all) {
      const el = v as unknown as { getBoundingClientRect?: () => DOMRect } | null;
      if (el?.getBoundingClientRect) {
        const b = el.getBoundingClientRect();
        rects.current[key] = { x: b.x, y: b.y, width: b.width, height: b.height };
      } else v?.measureInWindow((x, y, width, height) => (rects.current[key] = { x, y, width, height }));
    }
  };

  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef({ keys, onReorder, onDragging, rtl });
  live.current = { keys, onReorder, onDragging, rtl };
  const gesture = useRef({ key: '', from: -1, active: false, granted: false, pageX: 0, pageY: 0, dx: 0, dy: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> });

  const current = (): Drag => {
    const g = gesture.current;
    const ks = live.current.keys;
    const hit = dropTarget(ks.map((k) => rects.current[k]), g.pageX, g.pageY);
    const r = hit >= 0 ? rects.current[ks[hit]] : undefined;
    // "Before" is the reading-order start: the left half in English, the right half in Hebrew
    const startHalf = r ? (live.current.rtl ? g.pageX > r.x + r.width / 2 : g.pageX < r.x + r.width / 2) : false;
    const place = r ? dropPlacement(g.from, hit, startHalf) : null;
    return { key: g.key, dx: g.dx, dy: g.dy, to: place ? place.to : -1, lineKey: place ? ks[hit] : null, side: place?.side ?? null };
  };

  const lift = (key: string) => {
    const g = gesture.current;
    tap();
    Object.assign(g, { key, from: live.current.keys.indexOf(key), active: true, granted: false, dx: 0, dy: 0 });
    measure();
    live.current.onDragging?.(true);
    setDrag(current());
  };

  const end = (commit: boolean) => {
    const g = gesture.current;
    clearTimeout(g.timer);
    if (!g.active) return;
    const d = current();
    Object.assign(g, { active: false, granted: false });
    setDrag(null);
    live.current.onDragging?.(false);
    if (commit && d.to >= 0) {
      tap();
      live.current.onReorder(moveItem(live.current.keys, g.from, d.to));
    }
  };

  const release = () => {
    clearTimeout(gesture.current.timer);
    if (gesture.current.active && !gesture.current.granted) end(false);
  };

  const responders = useMemo(() => {
    const make = (key: string) =>
      PanResponder.create({
        // Start the hold timer but never take the touch: taps and scrolling work as usual
        onStartShouldSetPanResponderCapture: (e) => {
          const g = gesture.current;
          if (g.active) return false;
          clearTimeout(g.timer);
          g.pageX = e.nativeEvent.pageX;
          g.pageY = e.nativeEvent.pageY;
          g.timer = setTimeout(() => lift(key), LONG_PRESS_MS);
          return false;
        },
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
          Object.assign(gesture.current, { dx: s.dx, dy: s.dy, pageX: s.moveX, pageY: s.moveY });
          setDrag(current());
        },
        onPanResponderRelease: () => end(true),
        onPanResponderTerminate: () => end(false),
      });
    return new Map(keys.map((k) => [k, make(k)]));
    // One responder per chip; the callbacks read the latest values from refs
  }, [keys.join('|')]);

  // Browser: a release anywhere ends a pending hold, and the page must not
  // scroll under a lifted chip
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
  useEffect(() => () => clearTimeout(gesture.current.timer), []);

  // Drop bar: a short vertical bar in the gap on the landing side of the chip under the finger
  const target = drag?.lineKey ? rects.current[drag.lineKey] : undefined;
  const box = rects.current.__box;
  const leftSide = drag?.side === 'before' ? !rtl : rtl;
  const bar = target && box ? { left: (leftSide ? target.x - GAP / 2 : target.x + target.width + GAP / 2) - box.x - 2, top: target.y - box.y, height: target.height } : null;

  return (
    <View ref={boxRef} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
      {items.map((item) => {
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
              web ? ({ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', cursor: lifted ? 'grabbing' : undefined } as object) : null,
              lifted
                ? {
                    zIndex: 20,
                    transform: [{ translateX: drag.dx }, { translateY: drag.dy }, { scale: 1.08 }],
                    boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
                    borderRadius: 999,
                  }
                : null,
            ]}
          >
            {item.node}
          </View>
        );
      })}
      {bar ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', ...bar, width: 4, borderRadius: 2, zIndex: 30, backgroundColor: c.primary, boxShadow: `0 0 10px ${c.primary}` }}
        />
      ) : null}
    </View>
  );
}
