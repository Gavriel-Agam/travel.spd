import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, I18nManager, Modal, Platform, Pressable, useWindowDimensions, View, type ViewInstance } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { radius, space, useColors } from '@/theme';
import { Text, tap, type IconName } from './primitives';

const web = Platform.OS === 'web';

/** True when the layout runs right to left (Hebrew). */
export function isRTL() {
  if (web && typeof document !== 'undefined') return document.documentElement.dir === 'rtl';
  return I18nManager.isRTL;
}

export type MenuItem = {
  key: string;
  label: string;
  icon?: IconName | ReactNode;
  onPress?: () => void;
  /** Greyed out; tapping it shows `hint` in a small bubble for a moment ("Coming soon"). */
  disabled?: boolean;
  hint?: string;
  /** Shown at the end of the row (a badge, the current value). */
  right?: ReactNode;
  /** A choice in a list (language): a check mark, read out as selected. */
  selected?: boolean;
  /** Stays open after the tap (light / dark switches at once). */
  keepOpen?: boolean;
  danger?: boolean;
};

type Anchor = { x: number; y: number; w: number; h: number };

/**
 * The app's one dropdown: a small card that opens under the control that
 * opened it, lined up with that control's end (its left side in Hebrew).
 * Closes on a tap outside, Escape or the Android back button. In the browser
 * the focus moves into the menu, arrow keys move between the items, and the
 * focus returns to the control when it closes.
 */
export function Dropdown({
  anchor,
  visible,
  onClose,
  items,
  label,
  align = 'end',
  minWidth = 220,
}: {
  /** The control the menu opens from. */
  anchor: React.RefObject<ViewInstance | null>;
  visible: boolean;
  onClose: () => void;
  items: MenuItem[];
  /** Read out for the menu as a whole. */
  label: string;
  align?: 'start' | 'end';
  minWidth?: number;
}) {
  const c = useColors();
  const win = useWindowDimensions();
  const [pos, setPos] = useState<Anchor | null>(null);
  const [hintFor, setHintFor] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const menuRef = useRef<ViewInstance | null>(null);
  // Reduce motion (system setting): the menu just appears
  const still = useReducedMotion();

  // Where the control is on screen, every time the menu opens
  useEffect(() => {
    if (!visible) {
      setPos(null);
      setHintFor(null);
      return;
    }
    const node = anchor.current;
    if (!node?.measureInWindow) return setPos({ x: win.width - space.lg, y: 56, w: 0, h: 0 });
    node.measureInWindow((x, y, w, h) => setPos({ x, y, w, h }));
  }, [visible]);

  useEffect(() => {
    if (!visible || !pos) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: still ? 0 : 140, easing: Easing.out(Easing.cubic), useNativeDriver: !web }).start();
  }, [visible, pos]);

  useEffect(() => {
    if (!hintFor) return;
    const id = setTimeout(() => setHintFor(null), 1600);
    return () => clearTimeout(id);
  }, [hintFor]);

  // Browser keyboard: focus the first item, arrows move, Home / End jump; focus goes back on close
  useEffect(() => {
    if (!web || !visible || !pos) return;
    const opener = anchor.current as unknown as HTMLElement | null;
    const root = menuRef.current as unknown as HTMLElement | null;
    const list = () => Array.from(root?.querySelectorAll<HTMLElement>('[role="menuitem"],[role="menuitemradio"]') ?? []);
    const first = setTimeout(() => list()[0]?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      const els = list();
      if (!els.length) return;
      const i = els.indexOf(document.activeElement as HTMLElement);
      let next = -1;
      if (e.key === 'ArrowDown') next = (i + 1) % els.length;
      else if (e.key === 'ArrowUp') next = (i - 1 + els.length) % els.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = els.length - 1;
      else if (e.key === 'Tab') {
        // Tab leaves the menu the way it does in a native menu
        e.preventDefault();
        onClose();
        return;
      }
      if (next < 0) return;
      e.preventDefault();
      els[next].focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(first);
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [visible, pos]);

  if (!visible) return null;

  const rtl = isRTL();
  const width = Math.min(Math.max(minWidth, 0), win.width - space.lg * 2);
  // "end" is the control's right edge, or its left edge in Hebrew
  const endSide = (align === 'end') !== rtl ? 'right' : 'left';
  const horizontal = pos
    ? endSide === 'right'
      ? { right: Math.max(space.sm, win.width - (pos.x + pos.w)) }
      : { left: Math.max(space.sm, pos.x) }
    : null;
  const top = pos ? pos.y + pos.h + 6 : 0;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={label} accessibilityRole="none" importantForAccessibility="no" />
      {pos ? (
        <Animated.View
          ref={menuRef}
          accessibilityRole="menu"
          aria-label={label}
          style={[
            {
              position: 'absolute',
              top,
              width,
              maxHeight: win.height - top - space.lg,
              backgroundColor: c.card,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: c.border,
              paddingVertical: space.xs,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
            },
            horizontal,
            web ? ({ transformOrigin: `top ${endSide}`, overflowY: 'auto' } as object) : null,
          ]}
        >
          {items.map((item) => (
            <MenuRow
              key={item.key}
              item={item}
              hint={hintFor === item.key ? item.hint : undefined}
              onPress={() => {
                tap();
                if (item.disabled) return setHintFor(item.key);
                if (!item.keepOpen) onClose();
                item.onPress?.();
              }}
            />
          ))}
        </Animated.View>
      ) : null}
    </Modal>
  );
}

function MenuRow({ item, hint, onPress }: { item: MenuItem; hint?: string; onPress: () => void }) {
  const c = useColors();
  const color = item.disabled ? c.textMuted : item.danger ? c.danger : c.text;
  const iconColor = item.disabled ? c.textMuted : item.danger ? c.danger : c.primary;
  const radio = item.selected !== undefined;
  return (
    <Pressable
      accessibilityRole={(radio ? 'menuitemradio' : 'menuitem') as 'menuitem'}
      accessibilityState={{ disabled: !!item.disabled, ...(radio ? { checked: item.selected } : null) }}
      aria-disabled={item.disabled || undefined}
      accessibilityHint={item.disabled ? item.hint : undefined}
      onPress={onPress}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 48,
        paddingHorizontal: space.md,
        marginHorizontal: space.xs,
        borderRadius: radius.md,
        backgroundColor: pressed || focused ? c.cardAlt : 'transparent',
        ...(web ? ({ outlineStyle: 'none' } as object) : null),
      })}
    >
      <View style={{ opacity: item.disabled ? 0.55 : 1, flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
        {typeof item.icon === 'string' ? <Ionicons name={item.icon as IconName} size={21} color={iconColor} /> : item.icon ?? null}
        <Text style={{ flex: 1, fontWeight: '600' }} color={color} numberOfLines={2}>
          {item.label}
        </Text>
      </View>
      {hint ? (
        <View style={{ backgroundColor: c.text, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text variant="caption" color={c.card} style={{ fontWeight: '700' }}>
            {hint}
          </Text>
        </View>
      ) : item.right ? (
        item.right
      ) : item.selected ? (
        <Ionicons name="checkmark" size={20} color={c.primary} />
      ) : item.disabled ? (
        <Ionicons name="time-outline" size={16} color={c.textMuted} />
      ) : null}
    </Pressable>
  );
}

/**
 * A control that opens a Dropdown: pass how it looks, get the menu wired up
 * (expanded state, the "has a menu" hint for screen readers, positioning).
 */
export function DropdownButton({
  items,
  label,
  align,
  minWidth,
  children,
  style,
}: {
  items: MenuItem[];
  label: string;
  align?: 'start' | 'end';
  minWidth?: number;
  children: (open: boolean) => ReactNode;
  style?: object;
}) {
  const ref = useRef<ViewInstance | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        aria-haspopup="menu"
        aria-expanded={open}
        onPress={() => {
          tap();
          setOpen(true);
        }}
        style={style}
      >
        {children(open)}
      </Pressable>
      <Dropdown anchor={ref} visible={open} onClose={() => setOpen(false)} items={items} label={label} align={align} minWidth={minWidth} />
    </>
  );
}
