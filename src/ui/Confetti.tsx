import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { create } from 'zustand';
import { useColors } from '@/theme';

const native = Platform.OS !== 'web';
const PIECES = 26;
const DURATION = 1400;

/** Fire a small confetti burst from anywhere (e.g. after adding an expense). */
export const useConfetti = create<{ burst: number; fire: () => void }>((set) => ({
  burst: 0,
  fire: () => set((s) => ({ burst: s.burst + 1 })),
}));

type Piece = { x: number; drift: number; fall: number; spin: number; delay: number; w: number; h: number; color: string; round: boolean; v: Animated.Value };

/**
 * Mount once at the root, above everything and never catching touches. Each
 * burst throws a handful of small pieces from the top centre that drift and
 * fall away within about a second and a half. Skipped when the phone asks for
 * reduced motion.
 */
export function ConfettiHost() {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const burst = useConfetti((s) => s.burst);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!burst) return;
    let cancelled = false;
    (async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (reduce || cancelled) return;
      const colors = [c.primary, '#FFC233', '#FF5C8A', '#32D583', '#7A5AF8', '#06AED4'];
      const next: Piece[] = Array.from({ length: PIECES }, (_, i) => ({
        x: width / 2 + (Math.random() - 0.5) * 60,
        drift: (Math.random() - 0.5) * width * 0.9,
        fall: height * (0.45 + Math.random() * 0.35),
        spin: (Math.random() - 0.5) * 900,
        delay: Math.random() * 120,
        w: 6 + Math.random() * 5,
        h: 8 + Math.random() * 6,
        color: colors[i % colors.length],
        round: Math.random() < 0.3,
        v: new Animated.Value(0),
      }));
      setPieces(next);
      Animated.parallel(
        next.map((p) =>
          Animated.timing(p.v, { toValue: 1, duration: DURATION, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        ),
      ).start(() => setPieces([]));
      // Always clean up, even if the browser throttles animation frames
      if (clear.current) clearTimeout(clear.current);
      clear.current = setTimeout(() => setPieces([]), DURATION + 600);
    })();
    return () => {
      cancelled = true;
    };
  }, [burst]);

  if (!pieces.length) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: height * 0.12,
            width: p.w,
            height: p.round ? p.w : p.h,
            borderRadius: p.round ? p.w / 2 : 2,
            backgroundColor: p.color,
            opacity: p.v.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              // Up a little first, then away and down
              { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { translateY: p.v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, -40, p.fall] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
