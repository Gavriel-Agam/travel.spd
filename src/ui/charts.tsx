// Small, dependency-free charts on react-native-svg. Every chart is tappable:
// selecting a slice or bar reports its key so the screen can show details.
// Time axes always run left to right, also in Hebrew.
import { useRef, useState } from 'react';
import { Pressable, ScrollView, View, type LayoutChangeEvent, type ScrollViewInstance } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect } from 'react-native-svg';
import { useColors } from '@/theme';
import { Text } from './primitives';

// ---------------------------------------------------------------- donut

export type Slice = { key: string; value: number; color: string };

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = { x: cx + r * Math.sin(start), y: cy - r * Math.cos(start) };
  const e = { x: cx + r * Math.sin(end), y: cy - r * Math.cos(end) };
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function DonutChart({
  data,
  size = 200,
  thickness = 26,
  selected,
  onSelect,
  center,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  center?: React.ReactNode;
}) {
  const c = useColors();
  const total = data.reduce((t, d) => t + d.value, 0);
  const r = (size - thickness) / 2 - 4;
  const cx = size / 2;
  let angle = 0;
  const gap = data.length > 1 ? 0.025 : 0;

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cx} r={r} stroke={c.track} strokeWidth={thickness} fill="none" />
        {total > 0
          ? data.map((d) => {
              const sweep = (d.value / total) * Math.PI * 2;
              const start = angle + gap / 2;
              const end = angle + Math.max(sweep - gap / 2, start - angle + 0.001);
              angle += sweep;
              const on = selected === d.key;
              const dim = selected && !on;
              if (sweep >= Math.PI * 2 - 0.0001)
                return (
                  <Circle
                    key={d.key}
                    cx={cx}
                    cy={cx}
                    r={r}
                    stroke={d.color}
                    strokeWidth={thickness}
                    fill="none"
                    onPress={() => onSelect?.(on ? null : d.key)}
                  />
                );
              return (
                <Path
                  key={d.key}
                  d={arcPath(cx, cx, r, start, end)}
                  stroke={d.color}
                  strokeWidth={on ? thickness + 6 : thickness}
                  strokeOpacity={dim ? 0.35 : 1}
                  fill="none"
                  onPress={() => onSelect?.(on ? null : d.key)}
                />
              );
            })
          : null}
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: thickness + 12 }}>
        {center}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- bars

export type Bar = { key: string; label: string; value: number; color?: string };

export function BarChart({
  data,
  height = 160,
  barWidth = 22,
  selected,
  onSelect,
  limit,
  formatValue,
}: {
  data: Bar[];
  height?: number;
  barWidth?: number;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
  /** Draws a dashed reference line, e.g. the daily budget. */
  limit?: number | null;
  formatValue?: (v: number) => string;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const max = Math.max(1, limit ?? 0, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  // Shrink bars to fit the card; only scroll (ending on today) for long trips
  const gap = n > 14 ? 6 : 10;
  const fitted = (width - gap) / n - gap;
  barWidth = Math.max(10, Math.min(barWidth, fitted));
  const contentWidth = Math.max(width, n * (barWidth + gap) + gap);
  const labelEvery = Math.ceil(28 / (barWidth + gap)); // skip labels that would overlap
  const chartH = height - 22; // room for labels
  const y = (v: number) => chartH - (v / max) * (chartH - 28);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ direction: 'ltr' }}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={contentWidth > width}
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <View style={{ width: contentWidth, height }}>
            <Svg width={contentWidth} height={chartH}>
              {data.map((d, i) => {
                const x = gap + i * (barWidth + gap) + (contentWidth - (data.length * (barWidth + gap) + gap)) / 2;
                const top = y(d.value);
                const on = selected === d.key;
                const over = limit != null && d.value > limit;
                return (
                  <G key={d.key} onPress={() => onSelect?.(on ? null : d.key)}>
                    {/* Invisible full-height hit area so short bars are easy to tap */}
                    <Rect x={x - gap / 2} y={0} width={barWidth + gap} height={chartH} fill="transparent" />
                    <Rect
                      x={x}
                      y={Math.min(top, chartH - 3)}
                      width={barWidth}
                      height={Math.max(3, chartH - top)}
                      rx={6}
                      fill={d.color ?? (over ? c.danger : c.primary)}
                      fillOpacity={selected && !on ? 0.35 : 1}
                    />
                  </G>
                );
              })}
              {limit != null && limit > 0 ? (
                <Line x1={0} x2={contentWidth} y1={y(limit)} y2={y(limit)} stroke={c.textMuted} strokeDasharray="5 5" strokeWidth={1} />
              ) : null}
            </Svg>
            <View style={{ position: 'absolute', bottom: 0, left: 0, width: contentWidth, height: 18 }}>
              {data.map((d, i) => {
                const x = gap + i * (barWidth + gap) + (contentWidth - (data.length * (barWidth + gap) + gap)) / 2;
                const show = selected === d.key || (data.length - 1 - i) % labelEvery === 0;
                if (!show) return null;
                return (
                  <Text
                    key={d.key}
                    variant="caption"
                    faint={selected !== d.key}
                    style={{ position: 'absolute', top: 2, left: x + barWidth / 2 - 18, width: 36, textAlign: 'center', fontSize: 10 }}
                    numberOfLines={1}
                  >
                    {d.label}
                  </Text>
                );
              })}
            </View>
            {selected && formatValue
              ? (() => {
                  const i = data.findIndex((d) => d.key === selected);
                  if (i < 0) return null;
                  const x = gap + i * (barWidth + gap) + (contentWidth - (data.length * (barWidth + gap) + gap)) / 2;
                  const tipW = 96;
                  const left = Math.min(Math.max(0, x + barWidth / 2 - tipW / 2), contentWidth - tipW);
                  return (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: Math.max(0, y(data[i].value) - 30),
                        left,
                        width: tipW,
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ backgroundColor: c.text, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text variant="caption" color={c.card} numberOfLines={1}>
                          {formatValue(data[i].value)}
                        </Text>
                      </View>
                    </View>
                  );
                })()
              : null}
          </View>
        </ScrollView>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}

// ---------------------------------------------------------------- cumulative vs budget

export function PaceChart({
  points,
  height = 150,
}: {
  points: { cumulative: number; pace: number | null }[];
  height?: number;
}) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...points.map((p) => Math.max(p.cumulative, p.pace ?? 0)));
  const n = Math.max(2, points.length);
  const pad = 6;
  const x = (i: number) => pad + (i / (n - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const actual = points.map((p, i) => `${x(i)},${y(p.cumulative)}`).join(' ');
  const pacePts = points.filter((p) => p.pace != null);
  const pace = points.map((p, i) => (p.pace != null ? `${x(i)},${y(p.pace)}` : null)).filter(Boolean).join(' ');
  const last = points[points.length - 1];
  const over = last && last.pace != null && last.cumulative > last.pace;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height, direction: 'ltr' }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {pacePts.length > 1 ? <Polyline points={pace} fill="none" stroke={c.textFaint} strokeWidth={2} strokeDasharray="6 5" /> : null}
          <Polyline points={actual} fill="none" stroke={over ? c.danger : c.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
          {last ? <Circle cx={x(points.length - 1)} cy={y(last.cumulative)} r={5} fill={over ? c.danger : c.primary} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- legend row

export function LegendRow({
  color,
  label,
  value,
  pct,
  selected,
  onPress,
}: {
  color: string;
  label: string;
  value: string;
  pct?: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 7,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: selected ? c.cardAlt : pressed ? c.cardAlt : 'transparent',
      })}
    >
      <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {pct != null ? (
        <Text variant="caption" muted>
          {pct}%
        </Text>
      ) : null}
      <Text variant="mono">{value}</Text>
    </Pressable>
  );
}
