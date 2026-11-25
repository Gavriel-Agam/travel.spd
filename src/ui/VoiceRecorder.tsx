import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useVoiceExpense } from '@/hooks/useVoiceExpense';
import { useT } from '@/i18n';
import { blobToBase64, canRecord, startRecording, type Recorder } from '@/lib/recorder';
import { VOICE_MAX_SECONDS, VOICE_MIN_MS, VOICE_TEXT_MAX } from '@/lib/voice';
import { radius, space, useColors } from '@/theme';
import { isRTL } from './Dropdown';
import { Row, Text, tap, useTextFieldDirection } from './primitives';

const web = Platform.OS === 'web';
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** Bars in the waveform, newest at the end. */
const BARS = 40;
/** Slide up this far while holding to lock. */
const LOCK_DY = 70;
/** Slide toward the bin this far while holding to cancel (like WhatsApp). */
const CANCEL_DX = 90;
/** One size for the mic, lock, send and bin icons. */
const ICON = 28;
/** A press shorter than this is a tap: it starts a locked (hands-free) recording. */
const TAP_MS = 250;

type Mode = 'ready' | 'starting' | 'holding' | 'locked' | 'typing';

/**
 * The voice bar above the tab bar (opened from + › Voice): the live waveform
 * and the time on top; underneath, the mic at the start (hold to talk, slide
 * up to lock, or just tap for hands-free), Send in the middle once recording,
 * and the bin at the end to throw it away. Sent at once: the waiting row and
 * then the confirmation card take it from there.
 */
export function VoiceBar({ onClose }: { onClose: () => void }) {
  const c = useColors();
  const { t } = useT();
  const { submit } = useVoiceExpense();
  const still = useReducedMotion();
  const [mode, setMode] = useState<Mode>(canRecord() ? 'ready' : 'typing');
  const [message, setMessage] = useState<string | null>(canRecord() ? null : t('voice.micUnavailable'));
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [text, setText] = useState('');
  const rec = useRef<Recorder | null>(null);
  const started = useRef(0);
  const holding = useRef(false);
  const pressAt = useRef(0);
  const modeRef = useRef<Mode>(mode);
  modeRef.current = mode;
  const lift = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(still ? 1 : 0)).current;
  const input = useRef<TextInputInstance | null>(null);
  const dir = useTextFieldDirection(text);
  const recording = mode === 'holding' || mode === 'locked';

  useEffect(() => {
    if (!still) Animated.timing(appear, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    // Stop the microphone if the bar goes away mid-recording
    return () => rec.current?.cancel();
  }, []);

  // Time and waveform while recording; hard stop at 30 s
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const ms = Date.now() - started.current;
      setElapsed(ms);
      const lvl = rec.current?.level() ?? 0;
      setLevels((l) => [...l.slice(1), lvl]);
      if (ms >= VOICE_MAX_SECONDS * 1000) void send();
    }, 80);
    return () => clearInterval(id);
  }, [recording]);

  // The app went to the background mid-recording: send what there is
  useEffect(() => {
    if (!web || !recording || typeof document === 'undefined') return;
    const onHide = () => document.visibilityState === 'hidden' && void send();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [recording]);

  // Esc closes it (web)
  useEffect(() => {
    if (!web || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && discard();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function begin() {
    setMessage(null);
    setMode('starting');
    try {
      rec.current = await startRecording();
      started.current = Date.now();
      setElapsed(0);
      setLevels(Array(BARS).fill(0));
      // Let go while the browser was still asking for the mic: keep recording hands-free
      setMode(holding.current ? 'holding' : 'locked');
    } catch (e) {
      setMessage(t((e as Error).message === 'mic_denied' ? 'voice.micDenied' : 'voice.micUnavailable'));
      setMode('typing');
    }
  }

  function lock() {
    if (modeRef.current !== 'holding') return;
    tap();
    setMode('locked');
  }

  function discard() {
    rec.current?.cancel();
    rec.current = null;
    onClose();
  }

  async function send() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    const out = await r.stop();
    if (out.durationMs < VOICE_MIN_MS || out.blob.size < 600) {
      setMessage(t('voice.tooShort'));
      setMode('ready');
      setElapsed(0);
      setLevels(Array(BARS).fill(0));
      return;
    }
    tap();
    onClose();
    void submit({ audio: { mime: out.mime, data: await blobToBase64(out.blob) }, durationMs: out.durationMs });
  }

  function sendText() {
    const v = text.trim();
    if (!v) return;
    onClose();
    void submit({ text: v.slice(0, VOICE_TEXT_MAX) });
  }

  // The gesture below is made once; it always calls the latest of these
  const act = useRef({ begin, send, lock, discard });
  act.current = { begin, send, lock, discard };

  // Hold the mic to talk; slide up to lock; a quick tap records hands-free
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => modeRef.current === 'ready',
      onMoveShouldSetPanResponder: () => false,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        holding.current = true;
        pressAt.current = Date.now();
        tap();
        void act.current.begin();
      },
      onPanResponderMove: (_e, g) => {
        if (!holding.current) return;
        const up = Math.max(0, -g.dy);
        // Toward the bin: left in Hebrew, right in English
        const side = Math.max(0, isRTL() ? -g.dx : g.dx);
        lift.setValue(Math.min(1, up / LOCK_DY));
        slide.setValue(Math.min(1, side / CANCEL_DX));
        if (side >= CANCEL_DX) {
          holding.current = false;
          act.current.discard();
          return;
        }
        if (up >= LOCK_DY) {
          holding.current = false;
          lift.setValue(0);
          slide.setValue(0);
          act.current.lock();
        }
      },
      onPanResponderRelease: () => {
        const wasHolding = holding.current;
        holding.current = false;
        lift.setValue(0);
        slide.setValue(0);
        if (!wasHolding) return;
        // A tap: keep recording hands-free
        if (Date.now() - pressAt.current < TAP_MS) {
          if (modeRef.current === 'holding') setMode('locked');
          return;
        }
        if (modeRef.current === 'holding') void act.current.send();
      },
      onPanResponderTerminate: () => {
        holding.current = false;
        lift.setValue(0);
        slide.setValue(0);
        if (modeRef.current === 'holding') setMode('locked');
      },
    }),
  ).current;

  // Like WhatsApp: one short line, only while it helps
  const hint = mode === 'holding' || mode === 'starting' ? t('voice.slideCancel') : t('voice.holdHint');

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        start: 0,
        end: 0,
        bottom: '100%',
        paddingHorizontal: space.md,
        paddingTop: space.md,
        paddingBottom: space.md,
        gap: space.md,
        borderTopLeftRadius: radius.xl,
        borderTopRightRadius: radius.xl,
        backgroundColor: c.card,
        borderTopWidth: 1,
        borderColor: c.border,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
        elevation: 10,
        opacity: appear,
        transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}
    >
      {mode === 'typing' ? (
        <>
          {message ? (
            <Text variant="caption" color={c.warning} style={{ fontWeight: '600' }}>
              {message}
            </Text>
          ) : null}
          <Row gap={space.sm}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 999, backgroundColor: c.cardAlt, paddingStart: space.md }}>
              <TextInput
                ref={input}
                autoFocus
                value={text}
                onChangeText={setText}
                maxLength={VOICE_TEXT_MAX}
                placeholder={t('voice.typePlaceholder')}
                placeholderTextColor={c.textMuted}
                accessibilityLabel={t('voice.record')}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={sendText}
                {...(dir.dir ? ({ dir: dir.dir } as object) : null)}
                style={[{ flex: 1, minWidth: 0, height: 46, fontSize: 16, color: c.text }, dir.align, web ? ({ outlineStyle: 'none' } as object) : null]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('voice.send')}
                disabled={!text.trim()}
                onPress={sendText}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.4 }}
              >
                <Ionicons name="arrow-up-circle" size={32} color={c.primary} />
              </Pressable>
            </View>
            <RoundIcon icon="trash-outline" label={t('voice.discardRecording')} color={c.danger} onPress={discard} />
          </Row>
          {canRecord() ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setMode('ready')} style={{ alignSelf: 'flex-start' }}>
              <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
                🎙 {t('voice.recordInstead')}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          {/* Top: live waveform and the time */}
          <Row gap={space.md}>
            <Row gap={6} style={{ minWidth: 58 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: recording ? c.danger : c.textFaint }} />
              <Text variant="mono" style={{ fontWeight: '700' }} accessibilityLabel={`${t('voice.recording')} ${clock(elapsed)}`}>
                {clock(elapsed)}
              </Text>
            </Row>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' }}>
              {levels.map((l, i) => (
                <View key={i} style={{ width: 3, borderRadius: 2, height: Math.max(3, Math.round((still ? Math.min(l, 0.3) : l) * 30)), backgroundColor: recording ? c.primary : c.border }} />
              ))}
            </View>
          </Row>

          {/* Bottom: mic (start) · send (middle) · bin (end) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 64 }}>
            <View style={{ width: 64, alignItems: 'center' }}>
              {/* Slide up to lock: shows while holding */}
              {mode === 'holding' ? (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    bottom: 72,
                    alignItems: 'center',
                    gap: 2,
                    paddingVertical: 8,
                    width: 46,
                    borderRadius: 23,
                    backgroundColor: c.cardAlt,
                    borderWidth: 1,
                    borderColor: c.border,
                    transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }) }],
                  }}
                >
                  <Ionicons name="lock-open-outline" size={ICON - 6} color={c.textMuted} />
                  <Ionicons name="chevron-up" size={ICON - 8} color={c.textMuted} />
                </Animated.View>
              ) : null}
              <View
                {...(mode === 'ready' ? pan.panHandlers : null)}
                accessibilityRole="button"
                accessibilityLabel={mode === 'locked' ? t('voice.lockedHint') : t('voice.record')}
                accessibilityHint={mode === 'ready' ? t('voice.holdHint') : undefined}
                {...(web && mode === 'ready' ? ({ onKeyDown: (e: { key: string }) => (e.key === 'Enter' || e.key === ' ') && ((holding.current = false), void begin()) } as object) : null)}
                focusable={mode === 'ready'}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: recording ? c.danger : c.primary,
                  transform: [{ scale: mode === 'holding' ? 1.15 : 1 }],
                  ...(web ? ({ touchAction: 'none', userSelect: 'none', cursor: mode === 'ready' ? 'pointer' : 'default' } as object) : null),
                }}
              >
                <Ionicons name={mode === 'locked' ? 'lock-closed' : 'mic'} size={ICON} color="#fff" />
              </View>
            </View>

            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm }}>
              {mode === 'locked' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('voice.send')}
                  onPress={() => void send()}
                  style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: c.success, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}
                >
                  <Ionicons name="checkmark" size={ICON} color="#fff" />
                </Pressable>
              ) : (
                <Animated.View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    opacity: mode === 'holding' ? slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) : 1,
                    transform: [{ translateX: mode === 'holding' ? slide.interpolate({ inputRange: [0, 1], outputRange: [0, isRTL() ? -40 : 40] }) : 0 }],
                  }}
                >
                  {mode === 'holding' && !message ? <Ionicons name={isRTL() ? 'chevron-back' : 'chevron-forward'} size={16} color={c.textMuted} /> : null}
                  <Text variant="caption" color={message ? c.warning : c.textMuted} center numberOfLines={2} style={{ fontWeight: message ? '600' : '400' }}>
                    {message ?? hint}
                  </Text>
                </Animated.View>
              )}
            </View>

            <View style={{ width: 64, alignItems: 'center', gap: space.sm }}>
              <RoundIcon icon="trash-outline" label={t('voice.discardRecording')} color={c.danger} onPress={discard} />
            </View>
          </View>
        </>
      )}
    </Animated.View>
  );
}

function RoundIcon({ icon, label, color, onPress }: { icon: 'trash-outline'; label: string; color: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.cardAlt : 'transparent' })}
    >
      <Ionicons name={icon} size={ICON} color={color} />
    </Pressable>
  );
}
