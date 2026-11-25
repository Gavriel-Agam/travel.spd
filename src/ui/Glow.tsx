import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { radius } from '@/theme';

/** How long the ring stays before it fades. */
const HOLD_MS = 2200;

/**
 * A soft ring around a list row, shown for a moment and then faded out
 * ("Show in source" landed on this expense). Sits over the row and never
 * catches a tap. Reduced motion: it appears and goes without fading.
 */
export function Glow({ color, bottom = 0 }: { color: string; bottom?: number }) {
  const still = useReducedMotion();
  const o = useRef(new Animated.Value(still ? 1 : 0)).current;

  useEffect(() => {
    if (still) return;
    const anim = Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.delay(HOLD_MS),
      Animated.timing(o, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]);
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        bottom,
        left: 0,
        right: 0,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: color,
        backgroundColor: color + '14',
        opacity: o,
        ...(Platform.OS === 'web'
          ? ({ boxShadow: `0 0 0 4px ${color}33, 0 0 18px ${color}55` } as object)
          : { shadowColor: color, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }),
      }}
    />
  );
}
