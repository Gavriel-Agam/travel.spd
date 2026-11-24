import { onlineManager } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// (Not from ui/primitives, which uses this hook)
const tap = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

/** How far to pull (after damping) before letting go refreshes. */
export const PULL_TRIGGER = 64;
const PULL_MAX = 110;
/** The ✓ stays this long before the header closes. */
export const DONE_HOLD_MS = 600;
const NOTE_MS = 2200;

export type PullPhase = 'idle' | 'pulling' | 'refreshing' | 'done' | 'offline' | 'error';
export type PullState = { pull: number; phase: PullPhase };

/**
 * Pull down from the top of a scroll view to refresh (the web build has no
 * native pull-to-refresh). The header opens with the finger, shows a spinner
 * until `onRefresh` has fully finished, then a green ✓ for a moment (or a
 * short note when offline or it failed) and closes. Spread `touchProps` onto
 * the ScrollView and render <PullHeader {...state} /> above it.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>, p: { getY: () => number; enabled?: boolean }) {
  const [state, setState] = useState<PullState>({ pull: 0, phase: 'idle' });
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);
  const armed = useRef(false);
  const busy = useRef(false);
  const live = useRef(p);
  live.current = p;

  // The ✓ or a note shows for a moment, then the header closes
  useEffect(() => {
    if (state.phase !== 'done' && state.phase !== 'offline' && state.phase !== 'error') return;
    const id = setTimeout(() => setState({ pull: 0, phase: 'idle' }), state.phase === 'done' ? DONE_HOLD_MS : NOTE_MS);
    return () => clearTimeout(id);
  }, [state.phase]);

  async function refresh() {
    if (busy.current) return;
    busy.current = true;
    setState({ pull: 0, phase: 'refreshing' });
    let phase: PullPhase = 'done';
    try {
      if (!onlineManager.isOnline()) phase = 'offline';
      else await onRefresh();
    } catch {
      phase = onlineManager.isOnline() ? 'error' : 'offline';
    } finally {
      busy.current = false;
      if (phase === 'done') tap();
      setState({ pull: 0, phase });
    }
  }

  const set = (pull: number) => {
    pullRef.current = pull;
    setState((s) => (s.phase !== 'idle' && s.phase !== 'pulling' ? s : s.pull === pull ? s : { pull, phase: pull > 0 ? 'pulling' : 'idle' }));
  };

  const touchProps =
    Platform.OS === 'web'
      ? {
          onTouchStart: (e: { nativeEvent: { touches: ArrayLike<{ pageY: number; pageX: number }> } }) => {
            const tch = e.nativeEvent.touches[0];
            start.current = live.current.enabled !== false && !busy.current && live.current.getY() <= 0 && tch ? { y: tch.pageY, x: tch.pageX } : null;
            armed.current = false;
          },
          onTouchMove: (e: { nativeEvent: { touches: ArrayLike<{ pageY: number; pageX: number }> } }) => {
            const tch = e.nativeEvent.touches[0];
            if (!start.current || !tch) return;
            const dy = tch.pageY - start.current.y;
            const dx = Math.abs(tch.pageX - start.current.x);
            // Sideways (a swipe on a row) or scrolled away from the top: not a pull
            if (dx > Math.abs(dy) || live.current.getY() > 0) {
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
