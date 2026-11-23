import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputInstance } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useVoiceExpense } from '@/hooks/useVoiceExpense';
import { useT } from '@/i18n';
import { blockedInDemo } from '@/lib/demoPrompt';
import { blobToBase64, canRecord, startRecording, type Recorder } from '@/lib/recorder';
import { VOICE_MAX_SECONDS, VOICE_MIN_MS, VOICE_TEXT_MAX } from '@/lib/voice';
import { radius, space, useColors } from '@/theme';
import { Button, Row, Text, tap, useTextFieldDirection } from './primitives';

const web = Platform.OS === 'web';
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Mode = 'closed' | 'starting' | 'recording' | 'typing';

/**
 * 🎙 next to the + button: tap to start recording, tap Send (or reach 30 s)
 * to send. The panel above the tab bar shows the level and the time; "Or type
 * it" sends a typed sentence the same way. Sent at once: the waiting row and
 * then the confirmation card take it from there.
 */
export function VoiceButton({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const c = useColors();
  const { t } = useT();
  const qc = useQueryClient();
  const { submit } = useVoiceExpense();
  const still = useReducedMotion();
  const [mode, setMode] = useState<Mode>('closed');
  const [message, setMessage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [text, setText] = useState('');
  const rec = useRef<Recorder | null>(null);
  const started = useRef(0);
  const input = useRef<TextInputInstance | null>(null);
  const dir = useTextFieldDirection(text);

  useEffect(() => onOpenChange?.(mode !== 'closed'), [mode]);
  // Stop the microphone if the screen goes away mid-recording
  useEffect(() => () => rec.current?.cancel(), []);

  // Time and level while recording; hard stop at 30 s
  useEffect(() => {
    if (mode !== 'recording') return;
    const id = setInterval(() => {
      const ms = Date.now() - started.current;
      setElapsed(ms);
      if (!still) setLevel(rec.current?.level() ?? 0);
      if (ms >= VOICE_MAX_SECONDS * 1000) void send();
    }, 100);
    return () => clearInterval(id);
  }, [mode, still]);

  // The app went to the background mid-recording: send what there is
  useEffect(() => {
    if (!web || mode !== 'recording' || typeof document === 'undefined') return;
    const onHide = () => document.visibilityState === 'hidden' && void send();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [mode]);

  async function open() {
    if (blockedInDemo(qc)) return;
    tap();
    setMessage(null);
    setText('');
    if (!canRecord()) {
      setMessage(t('voice.micUnavailable'));
      setMode('typing');
      return;
    }
    setMode('starting');
    try {
      rec.current = await startRecording();
      started.current = Date.now();
      setElapsed(0);
      setMode('recording');
    } catch (e) {
      setMessage(t((e as Error).message === 'mic_denied' ? 'voice.micDenied' : 'voice.micUnavailable'));
      setMode('typing');
    }
  }

  function close() {
    rec.current?.cancel();
    rec.current = null;
    setMode('closed');
    setLevel(0);
  }

  async function send() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    const out = await r.stop();
    setMode('closed');
    setLevel(0);
    if (out.durationMs < VOICE_MIN_MS || out.blob.size < 600) {
      setMessage(t('voice.tooShort'));
      setMode('typing');
      return;
    }
    tap();
    void submit({ audio: { mime: out.mime, data: await blobToBase64(out.blob) }, durationMs: out.durationMs });
  }

  function sendText() {
    const v = text.trim();
    if (!v) return;
    setMode('closed');
    void submit({ text: v.slice(0, VOICE_TEXT_MAX) });
  }

  const recording = mode === 'recording' || mode === 'starting';
  return (
    <>
      {/* The button, on the start side of + */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('voice.record')}
        accessibilityState={{ expanded: mode !== 'closed' }}
        onPress={() => (mode === 'recording' ? void send() : mode === 'closed' ? void open() : close())}
        style={({ pressed }) => ({
          position: 'absolute',
          end: space.lg + 62 + space.md,
          top: -71,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: recording ? c.danger : c.card,
          borderWidth: recording ? 0 : 1,
          borderColor: c.border,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 5,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <Ionicons name={recording ? 'stop' : 'mic'} size={recording ? 22 : 26} color={recording ? '#fff' : c.primary} />
      </Pressable>

      {mode !== 'closed' ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            position: 'absolute',
            start: space.md,
            end: space.md,
            bottom: '100%',
            marginBottom: 88,
            maxWidth: 480,
            alignSelf: 'center',
            padding: space.lg,
            gap: space.md,
            borderRadius: radius.lg,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          {recording ? (
            <>
              <Row gap={space.md}>
                {/* Level ring: grows with the voice */}
                <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <View
                    style={{
                      position: 'absolute',
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: c.danger + '33',
                      transform: [{ scale: 0.7 + level * 0.6 }],
                    }}
                  />
                  <Ionicons name="mic" size={24} color={c.danger} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: '700' }}>{t('voice.recording')}</Text>
                  <Text variant="caption" muted numberOfLines={2}>
                    {t('voice.hint')}
                  </Text>
                </View>
                <Text variant="mono" muted accessibilityLabel={clock(elapsed)}>
                  {clock(elapsed)} / {clock(VOICE_MAX_SECONDS * 1000)}
                </Text>
              </Row>
              <Row gap={space.sm}>
                <Button title={t('common.cancel')} variant="ghost" onPress={close} style={{ flex: 1 }} />
                <Button title={t('voice.send')} icon="arrow-up" onPress={() => void send()} disabled={mode !== 'recording'} style={{ flex: 2 }} />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    close();
                    setMode('typing');
                    setTimeout(() => input.current?.focus(), 50);
                  }}
                >
                  <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
                    {t('voice.typeInstead')}
                  </Text>
                </Pressable>
                <Text variant="caption" faint>
                  {t('voice.privacy')}
                </Text>
              </Row>
            </>
          ) : (
            <>
              {message ? (
                <Text variant="caption" color={c.warning} style={{ fontWeight: '600' }}>
                  {message}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, backgroundColor: c.cardAlt, paddingStart: space.md }}>
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
                  onKeyPress={(e) => {
                    if (web && (e.nativeEvent as { key?: string }).key === 'Escape') close();
                  }}
                  {...(dir.dir ? ({ dir: dir.dir } as object) : null)}
                  style={[{ flex: 1, minWidth: 0, height: 48, fontSize: 16, color: c.text }, dir.align, web ? ({ outlineStyle: 'none' } as object) : null]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('voice.send')}
                  disabled={!text.trim()}
                  onPress={sendText}
                  style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.4 }}
                >
                  <Ionicons name="arrow-up-circle" size={32} color={c.primary} />
                </Pressable>
              </View>
              <Row style={{ justifyContent: 'space-between' }}>
                {canRecord() ? (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void open()}>
                    <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
                      🎙 {t('voice.recordInstead')}
                    </Text>
                  </Pressable>
                ) : (
                  <View />
                )}
                <Pressable accessibilityRole="button" hitSlop={8} onPress={close}>
                  <Text variant="caption" muted style={{ fontWeight: '600' }}>
                    {t('common.cancel')}
                  </Text>
                </Pressable>
              </Row>
            </>
          )}
        </View>
      ) : null}
    </>
  );
}
