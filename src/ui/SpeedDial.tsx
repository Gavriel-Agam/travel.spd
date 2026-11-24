import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useT } from '@/i18n';
import { space, useColors } from '@/theme';
import { Text, type IconName } from './primitives';

const FAB = 62;
const FAB_TOP = -76;
const PILL_H = 48;
const PILL_GAP = 12;

/**
 * The floating + (always one tap away). Tapping it dims the screen and raises
 * two pills above it, Type and Voice; tapping one opens that flow, tapping the
 * dimmed screen or × closes the menu. Sits above the tab bar.
 */
export function SpeedDial({ open, hidden, onToggle, onType, onVoice }: { open: boolean; hidden?: boolean; onToggle: (open: boolean) => void; onType: () => void; onVoice: () => void }) {
  const c = useColors();
  const { t } = useT();
  const still = useReducedMotion();
  const { height } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
    const done = ({ finished }: { finished: boolean }) => finished && !open && setMounted(false);
    if (still) {
      anim.setValue(open ? 1 : 0);
      if (!open) setMounted(false);
      return;
    }
    if (open) Animated.spring(anim, { toValue: 1, friction: 8, tension: 120, useNativeDriver: false }).start(done);
    else Animated.timing(anim, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(done);
  }, [open, still]);

  // Esc closes it (web)
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onToggle(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (hidden) return null;

  const items: { key: string; icon: IconName; label: string; onPress: () => void }[] = [
    { key: 'type', icon: 'create-outline', label: t('fab.type'), onPress: onType },
    { key: 'voice', icon: 'mic-outline', label: t('fab.voice'), onPress: onVoice },
  ];

  return (
    <>
      {mounted ? (
        <>
          {/* Dims (and on the web blurs) everything behind, the tab bar included */}
          <Animated.View style={{ position: 'absolute', start: 0, end: 0, bottom: 0, height, opacity: anim }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              onPress={() => onToggle(false)}
              style={[{ flex: 1, backgroundColor: 'rgba(8, 12, 20, 0.48)' }, Platform.OS === 'web' ? ({ backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', cursor: 'default' } as object) : null]}
            />
          </Animated.View>
          {/* Stacked pills above +, the nearest one first in, last out */}
          {items.map((it, i) => {
            const fromFab = items.length - 1 - i;
            const start = 0.12 * fromFab;
            const p = anim.interpolate({ inputRange: [start, Math.min(1, start + 0.75)], outputRange: [0, 1], extrapolate: 'clamp' });
            return (
              <Animated.View
                key={it.key}
                style={{
                  position: 'absolute',
                  end: space.lg + 4,
                  top: FAB_TOP - (fromFab + 1) * (PILL_H + PILL_GAP),
                  opacity: p,
                  transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={it.label}
                  onPress={it.onPress}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    height: PILL_H,
                    paddingHorizontal: 18,
                    borderRadius: PILL_H / 2,
                    backgroundColor: pressed ? c.cardAlt : c.card,
                    shadowColor: '#000',
                    shadowOpacity: 0.22,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 6,
                  })}
                >
                  <Ionicons name={it.icon} size={20} color={c.primary} />
                  <Text style={{ fontWeight: '700' }}>{it.label}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? t('common.close') : t('form.newTitle')}
        accessibilityState={{ expanded: open }}
        onPress={() => onToggle(!open)}
        style={({ pressed }) => ({
          position: 'absolute',
          end: space.lg,
          top: FAB_TOP,
          width: FAB,
          height: FAB,
          borderRadius: FAB / 2,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: c.primary,
          shadowOpacity: 0.4,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        {/* + turns into × */}
        <Animated.View style={{ transform: [{ rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
          <Ionicons name="add" size={34} color={c.primaryText} />
        </Animated.View>
      </Pressable>
    </>
  );
}
