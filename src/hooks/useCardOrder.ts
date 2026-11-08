import { useMemo, useRef, useState } from 'react';
import type { ScrollViewInstance } from 'react-native';
import { mergeVisibleOrder, resolveOrder } from '@/lib/homeLayout';
import { usePrefs } from '@/store/prefs';

/**
 * Card order for a screen whose cards can be dragged (Statistics, Budget),
 * saved on this device. `onReorder` takes the new order of the cards that are
 * showing; hidden cards keep their place.
 */
export function useCardOrder<T extends string>(screen: string, defaults: readonly T[]) {
  const saved = usePrefs((s) => s.screenOrders[screen]);
  const setScreenOrder = usePrefs((s) => s.setScreenOrder);
  const order = useMemo(() => resolveOrder(saved, defaults), [saved, defaults]);
  return {
    order,
    onReorder: (visible: string[]) => setScreenOrder(screen, mergeVisibleOrder<string>(order, visible)),
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
