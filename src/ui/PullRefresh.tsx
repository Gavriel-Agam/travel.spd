import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';
import { PULL_TRIGGER, type PullState } from '@/hooks/usePullToRefresh';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import { Row, Text } from './primitives';

/**
 * Top of a pull-to-refresh list: while pulling, an arrow that turns when
 * letting go will refresh; while refreshing, skeleton rows that stay until the
 * refresh has finished; afterwards, a short note when offline or it failed.
 */
export function PullRefresh({ pull, refreshing, result }: PullState) {
  const c = useColors();
  const { t } = useT();
  if (refreshing) return <RefreshSkeleton />;
  if (result)
    return (
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center', paddingVertical: space.sm }}>
        <Ionicons name={result === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'} size={16} color={result === 'offline' ? c.warning : c.danger} />
        <Text variant="caption" color={result === 'offline' ? c.warning : c.danger} style={{ fontWeight: '600' }}>
          {t(result === 'offline' ? 'pull.offline' : 'pull.failed')}
        </Text>
      </View>
    );
  if (pull <= 0) return null;
  const ready = pull >= PULL_TRIGGER;
  return (
    <View style={{ height: pull, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: space.sm, overflow: 'hidden' }}>
      <Row gap={6}>
        <Ionicons name="arrow-down" size={16} color={ready ? c.primary : c.textMuted} style={{ transform: [{ rotate: ready ? '180deg' : '0deg' }] }} />
        <Text variant="caption" color={ready ? c.primary : c.textMuted} style={{ fontWeight: '600' }}>
          {t(ready ? 'pull.release' : 'pull.pull')}
        </Text>
      </Row>
    </View>
  );
}

/** Three placeholder rows, gently pulsing (still with reduced motion). */
function RefreshSkeleton() {
  const c = useColors();
  const { t } = useT();
  const still = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.55, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still]);
  const block = (w: number | `${number}%`, h: number, r = 6) => <View style={{ width: w, height: h, borderRadius: r, backgroundColor: c.cardAlt }} />;
  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={t('pull.refreshing')}
      style={{ opacity: pulse, backgroundColor: c.card, borderRadius: radius.lg, padding: space.lg, gap: space.lg, marginBottom: space.md }}
    >
      {[0, 1, 2].map((i) => (
        <Row key={i} gap={space.md}>
          {block(40, 40, 12)}
          <View style={{ flex: 1, gap: 6 }}>
            {block('60%', 12)}
            {block('35%', 10, 5)}
          </View>
          {block(64, 14, 7)}
        </Row>
      ))}
    </Animated.View>
  );
}
