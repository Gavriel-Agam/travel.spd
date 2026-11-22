import Ionicons from '@expo/vector-icons/Ionicons';
import { onlineManager } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { compressScreenshot, processImport, useParseContext } from '@/hooks/useSmartImport';
import { useT } from '@/i18n';
import { IMPORT_FILE_ACCEPT, readImportFile, splitIntoParts } from '@/lib/importFiles';
import { SMART_DAILY_LIMIT, SMART_IMAGES_MAX, SMART_TEXT_MAX, type SmartImportRecord } from '@/lib/smartImport';
import { useSmartImports } from '@/store/smartImports';
import { radius, space, useColors } from '@/theme';
import { ImportBadge } from './ImportBadge';
import { Button, Field, Row, Text, tap } from './primitives';
import { Sheet } from './Sheet';

/** Step 1 of Smart import: paste text and/or add screenshots, then parse. */
export function SmartImportSheet({ visible, onClose, tripId }: { visible: boolean; onClose: () => void; tripId: string }) {
  const c = useColors();
  const { t, lang } = useT();
  const ctx = useParseContext();
  const records = useSmartImports((s) => s.records);
  const pending = useMemo(() => records.filter((r) => r.trip_id === tripId), [records, tripId]);
  const [text, setText] = useState('');
  const [images, setImages] = useState<{ blob: Blob; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // A file longer than the limit, in parts: the box holds parts[index]; the rest wait here
  const [file, setFile] = useState<{ name: string; parts: string[]; index: number; total: number } | null>(null);
  const [reading, setReading] = useState(false);

  // Thumbnails are local addresses: let them go when removed or closed
  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL?.(i.url)), []);
  useEffect(() => {
    if (visible) {
      setError(null);
      setNote(null);
    }
  }, [visible]);

  async function pick() {
    const room = SMART_IMAGES_MAX - images.length;
    if (room <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 1 });
    if (res.canceled) return;
    try {
      const added = await Promise.all(
        res.assets.slice(0, room).map(async (a) => {
          const blob = await compressScreenshot(a.uri);
          return { blob, url: URL.createObjectURL(blob) };
        }),
      );
      setImages((prev) => [...prev, ...added].slice(0, SMART_IMAGES_MAX));
      setError(null);
    } catch {
      setError(t('smartImport.errors.image_unreadable'));
    }
  }

  function reset() {
    images.forEach((i) => URL.revokeObjectURL?.(i.url));
    setImages([]);
    setText('');
    setFile(null);
  }

  /** Excel / CSV / Word / text file: read here, on this device, into the text box. */
  async function pickFile() {
    const picked = await chooseFile(IMPORT_FILE_ACCEPT);
    if (!picked) return;
    setError(null);
    setNote(null);
    setReading(true);
    try {
      const { text: read, kind } = await readImportFile(picked);
      const parts = splitIntoParts(read, SMART_TEXT_MAX, kind === 'sheet');
      setText(parts[0]);
      setFile({ name: picked.name, parts, index: 0, total: read.length });
    } catch (e) {
      setError(t(`smartImport.errors.${(e as Error).message}`, { defaultValue: t('smartImport.errors.file_unreadable') }));
    } finally {
      setReading(false);
    }
  }

  function openReview(id: string) {
    onClose();
    setTimeout(() => router.push({ pathname: '/smart-import/[id]', params: { id } }), 250);
  }

  async function parse() {
    if (busy || (!text.trim() && images.length === 0)) return;
    setError(null);
    setNote(null);
    const rec: SmartImportRecord = {
      id: Crypto.randomUUID(),
      trip_id: tripId,
      created_at: Date.now(),
      status: 'queued_offline',
      raw_text: text.trim() || undefined,
      compressed_images: images.map((i) => i.blob),
    };
    // Offline (or the trip's details not loaded yet): keep it, read it when back online
    if (!onlineManager.isOnline() || !ctx) {
      await useSmartImports.getState().put(rec);
      reset();
      setNote(t('smartImport.offlineQueued'));
      setTimeout(onClose, 1400);
      return;
    }
    setBusy(true);
    try {
      await useSmartImports.getState().put({ ...rec, status: 'processing' });
      const out = await processImport(rec, ctx);
      if (out.status === 'ready_for_review') {
        const next = nextPart();
        reset();
        if (next) setFile(next);
        openReview(out.id);
      } else if (out.status === 'queued_offline') {
        reset();
        setNote(t('smartImport.offlineQueued'));
      } else {
        // Failed right away: keep the text and pictures here to try again, not a stored import
        await useSmartImports.getState().remove(out.id);
        setError(t(`smartImport.errors.${out.error_message ?? 'parse_failed'}`));
      }
    } finally {
      setBusy(false);
    }
  }

  /** After one part of a long file is read, the next one waits for the next time the sheet opens. */
  function nextPart() {
    if (!file || file.index + 1 >= file.parts.length) return null;
    return { ...file, index: file.index + 1 };
  }
  // Coming back to a file with a part still waiting: that part goes in the box
  useEffect(() => {
    if (visible && file && !text) setText(file.parts[file.index]);
  }, [visible, file]);

  const time = (ms: number) => new Date(ms).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const canParse = (text.trim().length > 0 || images.length > 0) && !busy;

  return (
    <Sheet visible={visible} onClose={onClose} title={`✨ ${t('smartImport.title')}`}>
      <View style={{ padding: space.lg, gap: space.md }}>
        {pending.length ? (
          <View style={{ gap: space.sm }}>
            <Text variant="label" muted>
              {t('smartImport.pending')}
            </Text>
            {pending.map((r) => (
              <PendingRow
                key={r.id}
                rec={r}
                time={time(r.created_at)}
                onOpen={() => openReview(r.id)}
                onRetry={async () => {
                  if (!ctx || !onlineManager.isOnline()) return useSmartImports.getState().patch(r.id, { status: 'queued_offline', error_message: undefined });
                  const out = await processImport(r, ctx);
                  if (out.status === 'ready_for_review') openReview(out.id);
                }}
                onDiscard={() => useSmartImports.getState().remove(r.id)}
              />
            ))}
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: space.xs }} />
          </View>
        ) : null}

        <Text muted>{t('smartImport.intro')}</Text>
        <View>
          <Field
            value={text}
            onChangeText={(v) => setText(v.slice(0, SMART_TEXT_MAX))}
            placeholder={t('smartImport.textPlaceholder')}
            multiline
            maxLength={SMART_TEXT_MAX}
            style={{ minHeight: 120, textAlignVertical: 'top' }}
            accessibilityLabel={t('smartImport.title')}
          />
          <Text variant="caption" faint style={{ marginTop: 4, textAlign: 'right' }}>
            {`${text.length.toLocaleString('en-US')} / ${SMART_TEXT_MAX.toLocaleString('en-US')}`}
          </Text>
        </View>

        {file ? (
          <View style={{ gap: 6, padding: space.md, borderRadius: radius.md, backgroundColor: file.parts.length > 1 ? c.warning + '22' : c.cardAlt }}>
            <Row gap={space.sm}>
              <Ionicons name="document-text-outline" size={18} color={c.text} />
              <Text style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                {file.name}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('smartImport.removeFile')} hitSlop={8} onPress={() => { setFile(null); setText(''); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', margin: -12 }}>
                <Ionicons name="close" size={18} color={c.textMuted} />
              </Pressable>
            </Row>
            {file.parts.length > 1 ? (
              <>
                <Text variant="caption" color={c.text} accessibilityLiveRegion="polite">
                  {t('smartImport.fileParts', { total: file.total.toLocaleString('en-US'), max: SMART_TEXT_MAX.toLocaleString('en-US'), n: file.index + 1, parts: file.parts.length })}
                </Text>
                <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                  {file.index > 0 ? (
                    <Button title={t('smartImport.prevPart')} variant="secondary" icon="chevron-back" onPress={() => { const i = file.index - 1; setFile({ ...file, index: i }); setText(file.parts[i]); }} />
                  ) : null}
                  {file.index + 1 < file.parts.length ? (
                    <Button title={t('smartImport.nextPart')} variant="secondary" icon="chevron-forward" onPress={() => { const i = file.index + 1; setFile({ ...file, index: i }); setText(file.parts[i]); }} />
                  ) : null}
                </Row>
              </>
            ) : null}
          </View>
        ) : null}

        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {images.map((img, i) => (
            <View key={img.url} style={{ width: 72, height: 72 }}>
              <Image source={{ uri: img.url }} style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: c.cardAlt }} resizeMode="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('smartImport.removeImage')}
                onPress={() => {
                  tap();
                  URL.revokeObjectURL?.(img.url);
                  setImages((prev) => prev.filter((_, j) => j !== i));
                }}
                // 44 x 44 to touch, a 22 circle to see
                style={{ position: 'absolute', top: -17, end: -17, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{ backgroundColor: c.text, borderRadius: 999, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={14} color={c.card} />
                </View>
              </Pressable>
            </View>
          ))}
          {images.length < SMART_IMAGES_MAX ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                tap();
                pick();
              }}
              style={{
                height: 72,
                minWidth: 72,
                paddingHorizontal: space.md,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.primary + '88',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              <Ionicons name="images-outline" size={22} color={c.primary} />
              <Text variant="caption" color={c.primary} style={{ fontWeight: '600' }}>
                {t('smartImport.addImages', { count: images.length })}
              </Text>
            </Pressable>
          ) : null}
          {/* Spreadsheets and documents, read on this device (browser) */}
          {Platform.OS === 'web' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('smartImport.addFileLabel')}
              disabled={reading}
              onPress={() => {
                tap();
                void pickFile();
              }}
              style={{
                height: 72,
                minWidth: 72,
                paddingHorizontal: space.md,
                borderRadius: radius.md,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.primary + '88',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                opacity: reading ? 0.6 : 1,
              }}
            >
              <Ionicons name="document-attach-outline" size={22} color={c.primary} />
              <Text variant="caption" color={c.primary} style={{ fontWeight: '600' }}>
                {reading ? t('smartImport.readingFile') : t('smartImport.addFile')}
              </Text>
            </Pressable>
          ) : null}
        </Row>
        {Platform.OS === 'web' ? (
          <Text variant="caption" muted>
            {t('smartImport.fileTypes')}
          </Text>
        ) : null}

        {error ? <Text color={c.danger} accessibilityLiveRegion="polite">{error}</Text> : null}
        {note ? <Text color={c.primary}>{note}</Text> : null}
        <Button title={busy ? t('smartImport.parsing') : t('smartImport.parse')} icon="sparkles" onPress={parse} disabled={!canParse} loading={busy} />
        <Text variant="caption" faint center>
          {t('smartImport.limitNote', { count: SMART_DAILY_LIMIT })}
        </Text>
      </View>
    </Sheet>
  );
}

/** A small text link with a 44-high touch area that doesn't push the row apart. */
const linkHit = { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', marginVertical: -14 } as const;

function PendingRow({ rec, time, onOpen, onRetry, onDiscard }: { rec: SmartImportRecord; time: string; onOpen: () => void; onRetry: () => void; onDiscard: () => void }) {
  const c = useColors();
  const { t } = useT();
  const status = rec.status === 'ready_for_review' ? 'ready' : rec.status === 'error' ? 'error' : 'queued';
  const preview = rec.raw_text?.split('\n')[0] ?? (rec.compressed_images?.length ? `🖼️ × ${rec.compressed_images.length}` : '');
  return (
    <View style={{ gap: 6, padding: space.md, borderRadius: radius.md, backgroundColor: c.cardAlt }}>
      <Row gap={space.sm}>
        <Text style={{ flex: 1 }} numberOfLines={1}>
          {preview}
        </Text>
        <ImportBadge status={status} />
      </Row>
      {rec.status === 'error' && rec.error_message ? (
        <Text variant="caption" color={c.danger}>
          {t(`smartImport.errors.${rec.error_message}`)}
        </Text>
      ) : null}
      <Row gap={space.md}>
        <Text variant="caption" faint style={{ flex: 1 }}>
          {t('smartImport.queuedAt', { time })}
        </Text>
        <Pressable accessibilityRole="button" onPress={onDiscard} style={linkHit}>
          <Text variant="caption" color={c.textMuted} style={{ fontWeight: '700' }}>
            {t('smartImport.discard')}
          </Text>
        </Pressable>
        {rec.status === 'ready_for_review' ? (
          <Pressable accessibilityRole="button" onPress={onOpen} style={linkHit}>
            <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
              {t('smartImport.open')}
            </Text>
          </Pressable>
        ) : rec.status === 'error' ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={linkHit}>
            <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
              {t('smartImport.retry')}
            </Text>
          </Pressable>
        ) : null}
      </Row>
    </View>
  );
}

/** The browser's file picker; resolves with the chosen file, or null. Web only. */
function chooseFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // Closed without a file (browsers that report it)
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
