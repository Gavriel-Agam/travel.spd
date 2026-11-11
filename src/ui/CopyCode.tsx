import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import { Row, Text } from './primitives';

const native = Platform.OS !== 'web';

/** A short buzz: haptics on phones, the Vibration API in browsers that have it (Android; not iPhone Safari). */
function buzz() {
  if (native) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return;
  }
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.([18, 40, 18]);
  } catch {
    // not supported: the animation alone confirms the copy
  }
}

/**
 * The trip's invite code. Tapping copies it, with a wave of colour opening from
 * the centre out to both sides, a small pop of the code and a check mark, plus a short
 * vibration, so it is obvious the code was copied.
 */
export function CopyCode({ code, onCopied }: { code: string | null | undefined; onCopied?: () => void }) {
  const c = useColors();
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const ripple = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    buzz();
    setCopied(true);
    onCopied?.();
    ripple.setValue(0);
    pop.setValue(1);
    Animated.parallel([
      Animated.timing(ripple, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.07, duration: 110, useNativeDriver: native }),
        Animated.spring(pop, { toValue: 1, useNativeDriver: native, speed: 14, bounciness: 12 }),
      ]),
    ]).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  const size = 60;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? t('common.copied') : `${t('common.copy')} ${code ?? ''}`}
      onPress={copy}
      style={{
        backgroundColor: c.cardAlt,
        borderRadius: radius.md,
        padding: space.lg,
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: copied ? c.primary : 'transparent',
      }}
    >
      {/* The wave: starts as a dot in the centre and stretches out to both sides */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          // Centred without measuring the box (works even before layout events arrive)
          left: '50%',
          top: '50%',
          marginLeft: -size / 2,
          marginTop: -size / 2,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.primary,
          opacity: ripple.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.35, 0] }),
          transform: [
            // Wide and low: the wave runs out to both sides of the code box (clipped at its edges)
            { scaleX: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.05, 9] }) },
            { scaleY: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.05, 2.6] }) },
          ],
        }}
      />
      <Animated.View style={{ alignItems: 'center', transform: [{ scale: pop }] }}>
        <Text variant="title" style={{ letterSpacing: 6 }}>
          {code ?? '········'}
        </Text>
        <Row gap={4}>
          {copied ? <Ionicons name="checkmark-circle" size={14} color={c.success} /> : <Ionicons name="copy-outline" size={13} color={c.textMuted} />}
          <Text variant="caption" color={copied ? c.success : c.textMuted} style={{ fontWeight: copied ? '700' : '400' }}>
            {copied ? t('common.copied') : t('common.copy')}
          </Text>
        </Row>
      </Animated.View>
      <View />
    </Pressable>
  );
}
