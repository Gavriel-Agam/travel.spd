import { useMemo, useRef, useState } from 'react';
import type { ScrollViewInstance } from 'react-native';
import { HIDDEN_MARK, homeLayoutValue, mergeVisibleOrder, resolveOrder } from '@/lib/homeLayout';
import { usePrefs } from '@/store/prefs';

/**
 * Card order for a screen whose cards can be dragged (Statistics), saved on
 * this device. `onReorder` takes the new order of the cards that are showing.
 * Cards can be hidden (swipe a card, Hide) and shown again: saved in the same
 * list after a marker, like Home.
 */
export function useCardOrder<T extends string>(screen: string, defaults: readonly T[]) {
  const saved = usePrefs((s) => s.screenOrders[screen]);
  const setScreenOrder = usePrefs((s) => s.setScreenOrder);
  const { order, hidden } = useMemo(() => {
    const list = saved ?? [];
    const mark = list.indexOf(HIDDEN_MARK);
    const known = new Set<string>(defaults);
    const hidden = (mark < 0 ? [] : list.slice(mark + 1)).filter((k, i, a): k is T => known.has(k) && a.indexOf(k) === i);
    const order = resolveOrder(mark < 0 ? list : list.slice(0, mark), defaults).filter((k) => !hidden.includes(k));
    return { order, hidden };
  }, [saved, defaults]);
  const store = (visible: readonly string[], hid: readonly string[]) => setScreenOrder(screen, homeLayoutValue(visible, hid));
  return {
    order,
    hidden,
    onReorder: (visible: string[]) => store(mergeVisibleOrder<string>(order, visible), hidden),
    hide: (key: T) => store(order.filter((k) => k !== key), [...hidden, key]),
    show: (key: T) => store([...order, key], hidden.filter((k) => k !== key)),
  };
}

/**
 * What DraggableGrid needs from the screen's scroll view: a ref to scroll it,
 * the current offset and limits, and a flag to stop scrolling while a card is
 * held. Spread `scrollProps` onto the Screen.
 */
export function useDragScroll() {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scroll = useRef({ y: 0, max: 0, contentH: 0, viewH: 0 });
  const [dragging, setDragging] = useState(false);
  const measure = (patch: Partial<typeof scroll.current>) => {
    Object.assign(scroll.current, patch);
    scroll.current.max = Math.max(0, scroll.current.contentH - scroll.current.viewH);
  };
  return {
    scrollRef,
    scroll,
    setDragging,
    scrollProps: {
      ref: scrollRef,
      scrollEnabled: !dragging,
      scrollEventThrottle: 16,
      onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => (scroll.current.y = e.nativeEvent.contentOffset.y),
      onContentSizeChange: (_w: number, h: number) => measure({ contentH: h }),
      onLayout: (e: { nativeEvent: { layout: { height: number } } }) => measure({ viewH: e.nativeEvent.layout.height }),
    },
  };
}
