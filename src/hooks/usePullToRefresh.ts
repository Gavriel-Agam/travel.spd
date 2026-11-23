import { onlineManager } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { tap } from '@/ui/primitives';

/** How far to pull (after damping) before letting go refreshes. */
export const PULL_TRIGGER = 64;
const PULL_MAX = 110;

export type PullState = { pull: number; refreshing: boolean; result: 'offline' | 'error' | null };

/**
 * Pull down from the top of a scroll view to refresh (the web build has no
 * native pull-to-refresh). While refreshing, `refreshing` stays true until
 * `onRefresh` has fully finished; offline or a failure ends with a short
 * `result` instead. Spread `touchProps` onto the ScrollView.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>, p: { getY: () => number; enabled?: boolean }) {
  const [state, setState] = useState<PullState>({ pull: 0, refreshing: false, result: null });
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);
  const armed = useRef(false);
  const busy = useRef(false);

  // A result shows for a moment
  useEffect(() => {
    if (!state.result) return;
    const id = setTimeout(() => setState((s) => ({ ...s, result: null })), 2500);
    return () => clearTimeout(id);
  }, [state.result]);

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setState({ pull: 0, refreshing: true, result: null });
    let result: PullState['result'] = null;
    try {
      if (!onlineManager.isOnline()) result = 'offline';
      else await onRefresh();
    } catch {
      result = onlineManager.isOnline() ? 'error' : 'offline';
    } finally {
      busy.current = false;
      setState({ pull: 0, refreshing: false, result });
    }
  }

  const set = (pull: number) => {
    pullRef.current = pull;
    setState((s) => (s.pull === pull ? s : { ...s, pull }));
  };

  const touchProps =
    Platform.OS === 'web'
      ? {
          onTouchStart: (e: { nativeEvent: { touches: ArrayLike<{ pageY: number; pageX: number }> } }) => {
            const tch = e.nativeEvent.touches[0];
            start.current = p.enabled !== false && !busy.current && p.getY() <= 0 && tch ? { y: tch.pageY, x: tch.pageX } : null;
            armed.current = false;
          },
          onTouchMove: (e: { nativeEvent: { touches: ArrayLike<{ pageY: number; pageX: number }> } }) => {
            const tch = e.nativeEvent.touches[0];
            if (!start.current || !tch) return;
            const dy = tch.pageY - start.current.y;
            const dx = Math.abs(tch.pageX - start.current.x);
            // Sideways (a swipe on a row) or scrolled away from the top: not a pull
            if (dx > Math.abs(dy) || p.getY() > 0) {
              start.current = null;
              return set(0);
            }
            const pull = dy > 0 ? Math.min(PULL_MAX, dy * 0.5) : 0;
            if (pull >= PULL_TRIGGER && !armed.current) {
              armed.current = true;
              tap();
            }
            set(pull);
          },
          onTouchEnd: () => {
            const go = start.current && pullRef.current >= PULL_TRIGGER;
            start.current = null;
            set(0);
            if (go) void refresh();
          },
          onTouchCancel: () => {
            start.current = null;
            set(0);
          },
        }
      : {};

  return { ...state, touchProps, refresh };
}
