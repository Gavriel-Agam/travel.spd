import { createElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DISSOLVE_MS, registerDissolvable, useDissolve } from '@/store/dissolve';
import { useColors } from '@/theme';

/** Room around the row for the dust to drift into. */
const PAD = 48;

/**
 * Wraps a list row that can be deleted. When its id starts dissolving, the
 * row breaks into dust (a canvas of particles that sweep off and fade), its
 * content fades, and the space it took closes smoothly, so the list just
 * carries on. Reduced motion: a plain quick fade and close.
 */
export function Dissolve({ id, children }: { id: string; children: ReactNode }) {
  const active = useDissolve((s) => id in s.ids);
  const still = useReducedMotion();
  const c = useColors();
  const height = useRef(0);
  const [frozenH, setFrozenH] = useState<number | null>(null);
  const width = useRef(0);
  const fade = useRef(new Animated.Value(1)).current;
  const size = useRef(new Animated.Value(0)).current;

  useEffect(() => registerDissolvable(id), [id]);

  useEffect(() => {
    if (!active) {
      setFrozenH(null);
      fade.setValue(1);
      return;
    }
    const h = height.current;
    setFrozenH(h);
    size.setValue(h);
    const total = still ? 220 : DISSOLVE_MS;
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: total * 0.55, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      Animated.timing(size, { toValue: 0, duration: total * 0.5, delay: total * 0.45, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, [active]);

  return (
    <Animated.View
      onLayout={(e) => {
        if (active) return;
        height.current = e.nativeEvent.layout.height;
        width.current = e.nativeEvent.layout.width;
      }}
      style={frozenH !== null ? { height: size, zIndex: 3 } : undefined}
    >
      <Animated.View style={{ opacity: fade }}>{children}</Animated.View>
      {frozenH !== null && Platform.OS === 'web' && !still ? (
        <Dust width={width.current} height={frozenH} colors={[c.textMuted, c.text, c.primary, c.border, c.textFaint]} />
      ) : null}
    </Animated.View>
  );
}

type P = { x: number; y: number; vx: number; vy: number; r: number; color: string; delay: number; life: number };

/** The dust itself: particles spread over the row, leaving in a wave from one side. */
function Dust({ width, height, colors }: { width: number; height: number; colors: string[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !width || !height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = width + PAD * 2;
    const H = height + PAD * 2;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const rtl = document.documentElement.dir === 'rtl';
    const n = Math.min(420, Math.round((width * height) / 70));
    const parts: P[] = Array.from({ length: n }, () => {
      const x = Math.random() * width;
      // The wave starts at the far edge (left in Hebrew) and sweeps across
      const along = rtl ? x / width : 1 - x / width;
      return {
        x: x + PAD,
        y: Math.random() * height + PAD,
        vx: (rtl ? -1 : 1) * (0.6 + Math.random() * 1.6),
        vy: -(0.3 + Math.random() * 1.3),
        r: 0.8 + Math.random() * 1.8,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: along * DISSOLVE_MS * 0.45 + Math.random() * 60,
        life: 260 + Math.random() * 260,
      };
    });
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of parts) {
        const age = t - p.delay;
        if (age < 0) {
          alive = true;
          continue;
        }
        const k = age / p.life;
        if (k >= 1) continue;
        alive = true;
        const s = age / 16;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x + p.vx * s * (1 + k), p.y + p.vy * s * (1 + k) - k * k * 6, p.r * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      if (alive) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -PAD, left: -PAD, width: width + PAD * 2, height: height + PAD * 2 }}>
      {createElement('canvas', { ref, style: { width: '100%', height: '100%', display: 'block' }, 'aria-hidden': true })}
    </View>
  );
}
