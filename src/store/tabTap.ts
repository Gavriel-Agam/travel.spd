// Tapping the tab you are already on scrolls that screen back to the top.
import { useEffect, useRef, type RefObject } from 'react';
import { create } from 'zustand';

type TabTapState = {
  /** How many times each tab (route name) was tapped while already open. */
  taps: Record<string, number>;
  tap: (route: string) => void;
};

export const useTabTap = create<TabTapState>()((set) => ({
  taps: {},
  tap: (route) => set((s) => ({ taps: { ...s.taps, [route]: (s.taps[route] ?? 0) + 1 } })),
}));

type Scrollable = { scrollTo?: (o: { y: number; animated?: boolean }) => void } | null;

/** Scroll `ref` smoothly to the top whenever the tab `route` is tapped again. */
export function useScrollTopOnTabTap(route: string, ref: RefObject<Scrollable>) {
  const count = useTabTap((s) => s.taps[route] ?? 0);
  const seen = useRef(count);
  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    ref.current?.scrollTo?.({ y: 0, animated: true });
  }, [count, ref]);
}
