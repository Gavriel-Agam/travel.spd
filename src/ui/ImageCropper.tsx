import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Platform, Pressable, View, useWindowDimensions, type GestureResponderEvent, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/i18n';
import { clamp, clampOffset, containScale, coverScale, outputPlacement, placement, zoomAt, zoomLimits, type Point, type Size } from '@/lib/crop';
import { loadPicture } from '@/lib/image';
import { radius, space, useColors } from '@/theme';
import { Button, Row, Text } from './primitives';

type Loaded = { img: HTMLImageElement; src: string; size: Size; type: string };

const DIM = 'rgba(0,0,0,0.62)';

/**
 * Full-screen cropper for a picked picture (browser). The frame shows exactly
 * what will be kept: drag to move the picture, pinch with two fingers (or use
 * the mouse wheel / the − + buttons) to zoom, and a small preview shows the
 * result at the size it is used. `onConfirm` gets a square canvas of
 * `outputSize` pixels to encode.
 */
export function ImageCropper({
  uri,
  shape,
  outputSize,
  fit = 'auto',
  onCancel,
  onConfirm,
}: {
  /** The picked picture; null = closed. */
  uri: string | null;
  /** How the picture will be shown: a circle (profile photo) or a rounded square (category icon). */
  shape: 'circle' | 'square';
  outputSize: number;
  /** Starting zoom: fill the frame, show the whole picture, or decide by type (photos fill, drawings fit). */
  fit?: 'cover' | 'contain' | 'auto';
  onCancel: () => void;
  onConfirm: (canvas: HTMLCanvasElement) => void | Promise<void>;
}) {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const frameSide = Math.round(Math.min(width - space.xl * 2, height * 0.5, 360));
  const frame = useMemo(() => ({ w: frameSide, h: frameSide }), [frameSide]);
  const hole = shape === 'circle' ? frameSide / 2 : frameSide * 0.28;

  const [pic, setPic] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ scale: number; off: Point }>({ scale: 1, off: { x: 0, y: 0 } });
  const live = useRef({ view, pic, frame });
  live.current = { view, pic, frame };

  // Load the picture and start at the right zoom
  useEffect(() => {
    if (!uri) return;
    let gone = false;
    let src: string | null = null;
    setPic(null);
    setError(false);
    loadPicture(uri)
      .then((p) => {
        src = p.src;
        if (gone) return URL.revokeObjectURL(p.src);
        const loaded = { img: p.img, src: p.src, size: { w: p.w, h: p.h }, type: p.type };
        setPic(loaded);
        setView({ scale: startScale(loaded), off: { x: 0, y: 0 } });
      })
      .catch(() => !gone && setError(true));
    return () => {
      gone = true;
      if (src) URL.revokeObjectURL(src);
    };
  }, [uri]);

  /** Photos start filling the frame; logos and drawings start whole. */
  const startScale = (p: Loaded) => (fit === 'cover' || (fit === 'auto' && p.type === 'image/jpeg') ? coverScale(p.size, frame) : containScale(p.size, frame));

  /** Apply a new zoom / position, kept within the limits. */
  const apply = (scale: number, off: Point) => {
    const p = live.current.pic;
    if (!p) return;
    const { min, max } = zoomLimits(p.size, live.current.frame);
    const s = clamp(scale, min, max);
    setView({ scale: s, off: clampOffset(off, p.size, s, live.current.frame) });
  };
  const zoomBy = (factor: number, focal: Point = { x: 0, y: 0 }) => {
    const { scale, off } = live.current.view;
    const p = live.current.pic;
    if (!p) return;
    const { min, max } = zoomLimits(p.size, live.current.frame);
    const next = clamp(scale * factor, min, max);
    apply(next, zoomAt(scale, off, next, focal));
  };

  // The frame's centre on the page, to turn finger positions into frame coordinates
  const stageRef = useRef<ViewInstance | null>(null);
  const centre = useRef<Point>({ x: 0, y: 0 });
  const measureCentre = () => {
    const el = stageRef.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
    const b = el?.getBoundingClientRect?.();
    if (b) centre.current = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  // One finger (or the mouse) moves; two fingers zoom around the point between them and move with it
  const gesture = useRef<{ mode: 'pan' | 'pinch' | null; startView: { scale: number; off: Point }; dist: number; mid: Point; dx: number; dy: number }>({
    mode: null,
    startView: { scale: 1, off: { x: 0, y: 0 } },
    dist: 0,
    mid: { x: 0, y: 0 },
    dx: 0,
    dy: 0,
  });
  const pan = useMemo(() => {
    const touchesOf = (e: GestureResponderEvent) => (e.nativeEvent.touches ?? []) as unknown as { pageX: number; pageY: number }[];
    const begin = (e: GestureResponderEvent, dx: number, dy: number) => {
      const g = gesture.current;
      const ts = touchesOf(e);
      g.startView = live.current.view;
      g.dx = dx;
      g.dy = dy;
      if (ts.length >= 2) {
        g.mode = 'pinch';
        g.dist = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY) || 1;
        g.mid = { x: (ts[0].pageX + ts[1].pageX) / 2, y: (ts[0].pageY + ts[1].pageY) / 2 };
      } else g.mode = 'pan';
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        measureCentre();
        begin(e, 0, 0);
      },
      onPanResponderMove: (e, s) => {
        const g = gesture.current;
        const ts = touchesOf(e);
        const fingers = ts.length >= 2 ? 'pinch' : 'pan';
        // A finger was added or lifted: carry on from where the picture is now
        if (fingers !== g.mode) begin(e, s.dx, s.dy);
        if (g.mode === 'pinch' && ts.length >= 2) {
          const dist = Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY) || 1;
          const mid = { x: (ts[0].pageX + ts[1].pageX) / 2, y: (ts[0].pageY + ts[1].pageY) / 2 };
          const p = live.current.pic;
          if (!p) return;
          const { min, max } = zoomLimits(p.size, live.current.frame);
          const next = clamp(g.startView.scale * (dist / g.dist), min, max);
          const focal = { x: g.mid.x - centre.current.x, y: g.mid.y - centre.current.y };
          const zoomed = zoomAt(g.startView.scale, g.startView.off, next, focal);
          apply(next, { x: zoomed.x + (mid.x - g.mid.x), y: zoomed.y + (mid.y - g.mid.y) });
        } else {
          apply(g.startView.scale, { x: g.startView.off.x + (s.dx - g.dx), y: g.startView.off.y + (s.dy - g.dy) });
        }
      },
      onPanResponderRelease: () => (gesture.current.mode = null),
      onPanResponderTerminate: () => (gesture.current.mode = null),
    });
  }, []);

  // Browser: mouse wheel and trackpad pinch zoom around the pointer; the page itself never zooms here
  useEffect(() => {
    if (Platform.OS !== 'web' || !uri) return;
    const el = stageRef.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      measureCentre();
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), { x: e.clientX - centre.current.x, y: e.clientY - centre.current.y });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [uri, pic]);

  async function confirm() {
    const p = live.current.pic;
    if (!p) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('image_unreadable');
      ctx.imageSmoothingQuality = 'high';
      const o = outputPlacement(p.size, view.scale, view.off, frame, { w: outputSize, h: outputSize });
      ctx.drawImage(p.img, o.x, o.y, o.w, o.h);
      await onConfirm(canvas);
    } finally {
      setBusy(false);
    }
  }

  const box = pic ? placement(pic.size, view.scale, view.off, frame) : null;
  const limits = pic ? zoomLimits(pic.size, frame) : null;
  const stageH = frameSide + space.xl * 2;
  const frameLeft = (width - frameSide) / 2;
  const frameTop = space.xl;
  // A dark veil with a hole the shape of the result: a very thick rounded border around the frame
  const veil = Math.max(width, stageH) + 40;
  const preview = 64;
  const k = preview / frameSide;

  return (
    <Modal visible={!!uri} animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#0B0D14', paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.md, gap: space.md }}>
        <Row style={{ justifyContent: 'space-between', paddingHorizontal: space.lg }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} onPress={onCancel} hitSlop={10}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
          <Text variant="h2" color="#FFFFFF">
            {t('crop.title')}
          </Text>
          <View style={{ width: 26 }} />
        </Row>
        <Text variant="caption" color="#C9CCD8" center style={{ paddingHorizontal: space.lg }}>
          {t('crop.hint')}
        </Text>

        {/* The picture behind the frame: drag / pinch here */}
        <View
          ref={stageRef}
          {...pan.panHandlers}
          style={[
            { height: stageH, width: '100%', overflow: 'hidden', backgroundColor: '#05060A' },
            Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: 'grab' } as object) : null,
          ]}
        >
          {pic && box ? (
            <Image
              source={{ uri: pic.src }}
              resizeMode="stretch"
              accessibilityIgnoresInvertColors
              style={{ position: 'absolute', left: frameLeft + box.x, top: frameTop + box.y, width: box.w, height: box.h }}
            />
          ) : (
            <Text color="#C9CCD8" center style={{ marginTop: stageH / 2 - 10 }}>
              {error ? t('categories.imageUnreadable') : t('common.loading')}
            </Text>
          )}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: frameLeft - veil,
              top: frameTop - veil,
              width: frameSide + veil * 2,
              height: frameSide + veil * 2,
              borderWidth: veil,
              borderColor: DIM,
              borderRadius: hole + veil,
            }}
          />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: frameLeft, top: frameTop, width: frameSide, height: frameSide, borderRadius: hole, borderWidth: 2, borderColor: '#FFFFFFCC' }}
          />
        </View>

        {/* Zoom controls and the result at the size it is used */}
        <Row style={{ justifyContent: 'center', paddingHorizontal: space.lg }} gap={space.lg}>
          <ZoomButton icon="remove" label={t('crop.zoomOut')} onPress={() => zoomBy(1 / 1.25)} disabled={!limits || view.scale <= limits.min + 1e-6} />
          <ZoomButton
            icon="scan-outline"
            label={t('crop.reset')}
            onPress={() => pic && apply(startScale(pic), { x: 0, y: 0 })}
            disabled={!pic}
          />
          <ZoomButton icon="add" label={t('crop.zoomIn')} onPress={() => zoomBy(1.25)} disabled={!limits || view.scale >= limits.max - 1e-6} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: preview,
                height: preview,
                borderRadius: shape === 'circle' ? preview / 2 : preview * 0.28,
                overflow: 'hidden',
                backgroundColor: c.cardAlt,
                borderWidth: 1,
                borderColor: '#FFFFFF33',
              }}
            >
              {pic && box ? (
                <Image
                  source={{ uri: pic.src }}
                  resizeMode="stretch"
                  style={{ position: 'absolute', left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k }}
                />
              ) : null}
            </View>
            <Text variant="caption" color="#C9CCD8">
              {t('crop.preview', { size: `${outputSize}×${outputSize}` })}
            </Text>
          </View>
        </Row>

        <View style={{ flex: 1 }} />
        <Row gap={space.sm} style={{ paddingHorizontal: space.lg }}>
          <Button title={t('common.cancel')} variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
          <Button title={t('crop.use')} icon="checkmark" onPress={confirm} loading={busy} disabled={!pic} style={{ flex: 1 }} />
        </Row>
      </View>
    </Modal>
  );
}

function ZoomButton({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        backgroundColor: '#FFFFFF1F',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={24} color="#FFFFFF" />
    </Pressable>
  );
}
