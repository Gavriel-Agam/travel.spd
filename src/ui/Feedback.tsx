import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useSendFeedback } from '@/api/queries';
import { useT } from '@/i18n';
import { errorCode } from '@/lib/supabase';
import { bellNode, useFeedback } from '@/store/feedback';
import { radius, space, useColors } from '@/theme';
import { Button, Field, Row, Text } from './primitives';

type Box = { x: number; y: number; width: number; height: number };
const native = Platform.OS !== 'web';

/** Where a view is on screen (browser: right away; phone: a moment later). */
function boxOf(node: unknown): Promise<Box | null> {
  const el = node as { getBoundingClientRect?: () => DOMRect; measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
  if (el?.getBoundingClientRect) {
    const b = el.getBoundingClientRect();
    return Promise.resolve({ x: b.x, y: b.y, width: b.width, height: b.height });
  }
  if (el?.measureInWindow) return new Promise((res) => el.measureInWindow!((x, y, width, height) => res({ x, y, width, height })));
  return Promise.resolve(null);
}

/** The bell in the Home header: opens the feedback panel, and nudges when the panel collapses into it. */
export function FeedbackBell() {
  const c = useColors();
  const { t } = useT();
  const setOpen = useFeedback((s) => s.setOpen);
  const nudge = useFeedback((s) => s.nudge);
  const swing = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!nudge) return;
    swing.setValue(0);
    Animated.sequence([
      Animated.timing(swing, { toValue: 1, duration: 90, useNativeDriver: native }),
      Animated.timing(swing, { toValue: -1, duration: 120, useNativeDriver: native }),
      Animated.timing(swing, { toValue: 0.6, duration: 100, useNativeDriver: native }),
      Animated.spring(swing, { toValue: 0, useNativeDriver: native, speed: 14, bounciness: 10 }),
    ]).start();
  }, [nudge]);

  return (
    <Pressable
      ref={(v) => {
        bellNode.current = v;
      }}
      accessibilityRole="button"
      accessibilityLabel={t('feedback.bell')}
      onPress={() => setOpen(true)}
      hitSlop={8}
      style={{ padding: 6 }}
    >
      <Animated.View
        style={{
          transform: [
            { rotate: swing.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] }) },
            { scale: swing.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.15, 1, 1.15] }) },
          ],
        }}
      >
        <Ionicons name="notifications-outline" size={21} color={c.primary} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * Panel at the top of the Home screen asking for feedback. It takes its own
 * space and pushes the screen down (nothing is covered); the space opens and
 * closes smoothly. Closing it (X, or after sending) shrinks it into the bell,
 * so people learn where to find it again.
 */
export function FeedbackBanner({ tripId }: { tripId?: string | null }) {
  const c = useColors();
  const { t, lang } = useT();
  const open = useFeedback((s) => s.open);
  const send = useSendFeedback();
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<unknown>(null);
  const v = useRef({ opacity: new Animated.Value(0), x: new Animated.Value(0), y: new Animated.Value(-16), scale: new Animated.Value(1) }).current;
  const closing = useRef(false);
  // While open the panel sits in the page at its natural height (pushing the
  // screen down). On close its space shrinks from that height to nothing
  // (JS-driven: height can't use the native driver).
  const room = useRef({ h: new Animated.Value(0), gap: new Animated.Value(0) }).current;
  const [shrinking, setShrinking] = useState(false);

  // Open: drop in from the top
  useEffect(() => {
    if (!open || visible) return;
    closing.current = false;
    setSent(false);
    setError(null);
    v.x.setValue(0);
    v.y.setValue(-16);
    v.scale.setValue(1);
    v.opacity.setValue(0);
    setShrinking(false);
    room.gap.setValue(0);
    setVisible(true);
    Animated.parallel([
      Animated.timing(v.opacity, { toValue: 1, duration: 220, useNativeDriver: native }),
      Animated.spring(v.y, { toValue: 0, useNativeDriver: native, speed: 16, bounciness: 6 }),
    ]).start();
    // Same safety as below: fully shown even if animation frames are throttled
    const id = setTimeout(() => {
      if (closing.current) return;
      v.opacity.stopAnimation();
      v.y.stopAnimation();
      v.opacity.setValue(1);
      v.y.setValue(0);
    }, 600);
    return () => clearTimeout(id);
  }, [open]);

  // Close: shrink and fly into the bell, then nudge it
  const collapse = async () => {
    if (closing.current) return;
    closing.current = true;
    const [from, to] = await Promise.all([boxOf(panel.current), boxOf(bellNode.current)]);
    const dx = from && to ? to.x + to.width / 2 - (from.x + from.width / 2) : 0;
    const dy = from && to ? to.y + to.height / 2 - (from.y + from.height / 2) : -80;
    const ease = Easing.bezier(0.55, 0, 0.75, 0.2);
    // From here the panel's space has a fixed height that shrinks to nothing
    room.h.setValue(from?.height ?? 0);
    setShrinking(true);
    // Finish once: when the animation ends, or after a short safety delay if the
    // browser throttles animation frames (background tab, low-power mode)
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setVisible(false);
      useFeedback.getState().setOpen(false);
      useFeedback.getState().nudgeBell();
    };
    Animated.parallel([
      Animated.timing(room.h, { toValue: 0, duration: 420, easing: ease, useNativeDriver: false }),
      Animated.timing(room.gap, { toValue: -space.lg, duration: 420, easing: ease, useNativeDriver: false }),
    ]).start();
    Animated.parallel([
      Animated.timing(v.x, { toValue: dx, duration: 420, easing: ease, useNativeDriver: native }),
      Animated.timing(v.y, { toValue: dy, duration: 420, easing: ease, useNativeDriver: native }),
      Animated.timing(v.scale, { toValue: 0.04, duration: 420, easing: ease, useNativeDriver: native }),
      Animated.timing(v.opacity, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: native }),
    ]).start(finish);
    setTimeout(finish, 900);
  };

  async function submit() {
    const message = text.trim();
    if (!message) return;
    setError(null);
    try {
      await send.mutateAsync({ tripId, message, lang, appVersion: Constants.expoConfig?.version ?? null });
      setText('');
      setSent(true);
      setTimeout(collapse, 1300);
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`, { defaultValue: t('errors.unknown') }));
    }
  }

  if (!visible) return null;

  return (
    <Animated.View style={{ height: shrinking ? room.h : undefined, marginBottom: room.gap, zIndex: 50 }}>
    <Animated.View
      ref={(n: unknown) => {
        panel.current = n;
      }}
      accessibilityViewIsModal={false}
      style={{
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        backgroundColor: c.card,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: c.primary + '55',
        padding: space.md,
        gap: space.sm,
        boxShadow: `0 8px 24px rgba(0,0,0,0.25), 0 0 18px ${c.primary}22`,
        opacity: v.opacity,
        transform: [{ translateX: v.x }, { translateY: v.y }, { scale: v.scale }],
      }}
    >
      <Row align="flex-start" gap={space.sm}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={c.primary} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, fontWeight: '600' }}>{sent ? t('feedback.thanks') : t('feedback.prompt')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('feedback.close')} onPress={collapse} hitSlop={10} style={{ padding: 2 }}>
          <Ionicons name="close" size={20} color={c.textMuted} />
        </Pressable>
      </Row>
      {!sent ? (
        <>
          <Field
            value={text}
            onChangeText={setText}
            placeholder={t('feedback.placeholder')}
            multiline
            maxLength={2000}
            style={{ minHeight: 70, textAlignVertical: 'top' }}
          />
          {error ? (
            <Text variant="caption" color={c.danger}>
              {error}
            </Text>
          ) : null}
          <Button title={t('feedback.send')} icon="send" onPress={submit} loading={send.isPending} disabled={!text.trim()} />
        </>
      ) : null}
    </Animated.View>
    </Animated.View>
  );
}
