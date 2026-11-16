import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useColors } from '@/theme';

// Only a real mouse hovers (on a phone a tap would leave a "hover" stuck on)
const canHover = Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/**
 * A thin dashed outline around something that can be dragged: subtle while the
 * mouse is over it, stronger while it is being dragged. Drawn on top, never
 * catches touches, and doesn't change the item's size.
 */
export function DragOutline({ visible, strong = false, radius }: { visible: boolean; strong?: boolean; radius: number }) {
  const c = useColors();
  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -3,
        bottom: -3,
        left: -3,
        right: -3,
        borderRadius: radius + 3,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: c.primary + (strong ? 'CC' : '66'),
        zIndex: 30,
      }}
    />
  );
}

/** Which item the mouse is over (web, mouse only): spread `props(key)` onto each item's View. */
export function useHoverKey() {
  const [hover, setHover] = useState<string | null>(null);
  const props = (key: string) =>
    canHover
      ? ({ onMouseEnter: () => setHover(key), onMouseLeave: () => setHover((h) => (h === key ? null : h)) } as object)
      : null;
  return { hover, props };
}
