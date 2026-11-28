import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Content that opens and closes under its header: the height grows from 0 to
 * the content's own height (measured), with a fade. Stays mounted while
 * closing so the animation can run, then unmounts.
 */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const still = useReducedMotion();
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [height, setHeight] = useState(0);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: still ? 0 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open]);

  if (!mounted) return null;
  return (
    <Animated.View
      style={{
        overflow: 'hidden',
        opacity: progress,
        // Until measured, the content shows at its own height
        height: height ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) : undefined,
      }}
    >
      <View style={{ position: height ? 'absolute' : 'relative', top: 0, start: 0, end: 0 } as object} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}
