import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import { hitArea } from './primitives';

const BUBBLE = 280;
const EDGE = 12;

/**
 * A small ⓘ that opens a short note right under it. Tapping anywhere closes
 * it. Keeps detail off the screen until someone asks for it.
 */
/** `icon`/`color` swap the ⓘ (e.g. a 🔒 for a privacy note); `circled` draws it in a small ring. */
export function InfoTip({
  label,
  children,
  size = 16,
  icon = 'information-circle-outline',
  color,
  circled = false,
}: {
  label: string;
  children: ReactNode;
  size?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
  circled?: boolean;
}) {
  const c = useColors();
  const { lang } = useT();
  const rtl = lang === 'he';
  const { width: screenW } = useWindowDimensions();
  const ref = useRef<ViewInstance | null>(null);
  const [at, setAt] = useState<null | { x: number; y: number; w: number; h: number }>(null);

  const open = () => ref.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAt({ x, y, w, h }));
  const close = () => setAt(null);

  const width = Math.min(BUBBLE, screenW - EDGE * 2);
  // Lined up with the icon on the reading side, kept on screen
  const want = at ? (rtl ? at.x + at.w + 8 - width : at.x - 8) : 0;
  const left = Math.max(EDGE, Math.min(want, screenW - EDGE - width));
  const arrow = at ? Math.max(14, Math.min(width - 14, at.x + at.w / 2 - left)) : 0;

  return (
    <>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={open}
        accessibilityState={{ expanded: !!at }}
        style={({ pressed }) => [hitArea(circled ? size + 8 : size), { opacity: pressed ? 0.6 : 1 }]}
      >
        {circled ? (
          <View style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderWidth: 1, borderColor: color ?? c.textMuted, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={size - 4} color={color ?? c.textMuted} />
          </View>
        ) : (
          <Ionicons name={icon} size={size} color={color ?? c.textMuted} />
        )}
      </Pressable>
      <Modal visible={!!at} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel={label}>
          {at ? (
            <View
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              style={{
                position: 'absolute',
                top: at.y + at.h + 8,
                left,
                width,
                backgroundColor: c.card,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: c.border,
                padding: space.md,
                gap: 4,
                boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
              }}
            >
              {/* The little point towards the icon */}
              <View
                style={{
                  position: 'absolute',
                  top: -6,
                  left: arrow - 6,
                  width: 12,
                  height: 12,
                  backgroundColor: c.card,
                  borderLeftWidth: 1,
                  borderTopWidth: 1,
                  borderColor: c.border,
                  transform: [{ rotate: '45deg' }],
                }}
              />
              {children}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}
