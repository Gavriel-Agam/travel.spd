import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View, type ViewInstance } from 'react-native';
import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import { Text } from './primitives';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Where a picture goes in: a box with a dashed outline, so it reads at once
 * as "put an image here". Tap to choose one; in the browser an image file can
 * also be dropped on it (the outline turns solid while one is over it).
 */
export function UploadZone({ title, hint, icon = 'image-outline', onPress, onDropFile, busy, compact, style }: {
  title: string;
  hint?: string;
  icon?: IconName;
  onPress: () => void;
  /** Browser: an image file was dropped on the box (a local link to it, and its type). */
  onDropFile?: (uri: string, mime: string) => void;
  busy?: boolean;
  /** One line (icon beside the words) for tight spots. */
  compact?: boolean;
  style?: object;
}) {
  const c = useColors();
  const { t } = useT();
  const ref = useRef<ViewInstance | null>(null);
  const [over, setOver] = useState(false);
  const drop = useRef(onDropFile);
  drop.current = onDropFile;
  const canDrop = Platform.OS === 'web' && !!onDropFile;

  useEffect(() => {
    if (!canDrop) return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const hasFile = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget || !el.contains(e.relatedTarget as Node)) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      setOver(false);
      const file = Array.from(e.dataTransfer?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (file) drop.current?.(URL.createObjectURL(file), file.type);
    };
    el.addEventListener('dragenter', enter);
    el.addEventListener('dragover', enter);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragenter', enter);
      el.removeEventListener('dragover', enter);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', onDrop);
    };
  }, [canDrop]);

  const lines = [hint, canDrop ? t('upload.drop') : null].filter(Boolean) as string[];
  const badge = (
    <View style={{ width: compact ? 34 : 44, height: compact ? 34 : 44, borderRadius: 22, backgroundColor: c.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
      {busy ? <ActivityIndicator color={c.primary} /> : <Ionicons name={over ? 'download-outline' : icon} size={compact ? 18 : 22} color={c.primary} />}
    </View>
  );

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={lines.join(' ')}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        {
          borderWidth: 1.5,
          borderStyle: over ? 'solid' : 'dashed',
          borderColor: over ? c.primary : c.primary + '8C',
          backgroundColor: over ? c.primary + '1F' : c.primary + '0D',
          borderRadius: radius.md,
          paddingVertical: compact ? space.sm + 2 : space.lg,
          paddingHorizontal: space.md,
          alignItems: 'center',
          flexDirection: compact ? 'row' : 'column',
          gap: compact ? space.sm : 6,
          opacity: busy ? 0.6 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {badge}
      <View style={{ alignItems: compact ? 'flex-start' : 'center', flexShrink: 1, gap: 2 }}>
        <Text variant="label" color={c.primary} style={{ fontWeight: '700' }} center={!compact}>
          {title}
        </Text>
        {lines.map((l) => (
          <Text key={l} variant="caption" muted center={!compact}>
            {l}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}
