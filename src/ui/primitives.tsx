import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode, Ref } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewInstance,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { flatten, readableOn } from '@/lib/contrast';
import { errorCode } from '@/lib/supabase';
import { useT } from '@/i18n';
import { useTripLook } from '@/store/tripLook';
import { radius, space, useColors } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function tap() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

// ---------------------------------------------------------------- text

type Variant = 'hero' | 'title' | 'h2' | 'body' | 'label' | 'caption' | 'mono';

const variants: Record<Variant, TextStyle> = {
  hero: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  h2: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '500' },
  mono: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
};

export function Text({
  variant = 'body',
  muted,
  faint,
  color,
  center,
  style,
  ...rest
}: TextProps & { variant?: Variant; muted?: boolean; faint?: boolean; color?: string; center?: boolean }) {
  const c = useColors();
  return (
    <RNText
      {...rest}
      style={[
        variants[variant],
        { color: color ?? (faint ? c.textFaint : muted ? c.textMuted : c.text), writingDirection: 'auto' },
        // Start-aligned text that follows the layout direction
        { textAlign: center ? 'center' : 'auto' },
        style,
      ]}
    />
  );
}

// ---------------------------------------------------------------- layout

/**
 * The trip's cover photo as a faint backdrop behind a screen (only while a trip
 * with a photo is open). Low opacity so text on the page keeps its contrast.
 */
export function TripBackdrop() {
  const uri = useTripLook((s) => s.coverUrl);
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      style={[StyleSheet.absoluteFill, { opacity: 0.07 }]}
      pointerEvents="none"
    />
  );
}

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  contentStyle,
  ...rest
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  ref?: Ref<ScrollViewInstance>;
} & ScrollViewProps) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      <TripBackdrop />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ padding: space.lg, paddingBottom: 120, gap: space.lg }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          {...rest}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Row({ children, gap = space.sm, style, align = 'center' }: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  align?: ViewStyle['alignItems'];
}) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap }, style]}>{children}</View>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.card,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    shadowColor: '#11142D',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, style]}>
      {children}
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text variant="h2">{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text variant="label" color={c.primary}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

// ---------------------------------------------------------------- controls

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: c.primarySoft, ghost: 'transparent', danger: c.dangerSoft }[variant];
  const fg = { primary: c.primaryText, secondary: c.primary, ghost: c.primary, danger: c.danger }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          height: 52,
          borderRadius: radius.md,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          paddingHorizontal: space.lg,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text variant="h2" color={fg} style={{ fontSize: 16 }}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, size = 22, color, label }: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  color?: string;
  label?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.cardAlt : 'transparent',
      })}
    >
      <Ionicons name={name} size={size} color={color ?? c.text} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, color }: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  color?: string;
}) {
  const c = useColors();
  const accent = color ?? c.primary;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        height: 36,
        borderRadius: radius.pill,
        // A tint of the colour with an outline: some category colours can't carry readable text
        backgroundColor: selected ? flatten(accent + '2E', c.card) : c.cardAlt,
        borderWidth: 1.5,
        borderColor: selected ? accent : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <RNText style={{ fontSize: 15 }}>{icon}</RNText> : null}
      <Text variant="label" color={c.text} style={selected ? { fontWeight: '700' } : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              paddingVertical: 9,
              borderRadius: radius.sm,
              alignItems: 'center',
              backgroundColor: on ? c.card : 'transparent',
              shadowColor: '#000',
              shadowOpacity: on ? 0.08 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Text variant="label" color={on ? c.text : c.textMuted} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, error, hint, style, ...input }: TextInputProps & { label?: string; error?: string | null; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="label" muted>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.textFaint}
        {...input}
        style={[
          {
            minHeight: 50,
            borderRadius: radius.md,
            backgroundColor: c.cardAlt,
            paddingHorizontal: space.lg,
            paddingVertical: 12,
            fontSize: 16,
            color: c.text,
            textAlign: 'auto',
            borderWidth: 1,
            borderColor: error ? c.danger : 'transparent',
          } as TextStyle,
          style,
        ]}
      />
      {error ? (
        <Text variant="caption" color={c.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function ListRow({ icon, iconBg, title, subtitle, right, onPress, chevron }: {
  icon?: ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: PressableProps['onPress'];
  chevron?: boolean;
}) {
  const c = useColors();
  const { lang } = useT();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Row gap={space.md} style={{ paddingVertical: 10 }}>
        {icon ? (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: iconBg ?? c.cardAlt,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" style={{ fontWeight: '600' }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" muted numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
        {chevron ? <Ionicons name={lang === 'he' ? 'chevron-back' : 'chevron-forward'} size={18} color={c.textFaint} /> : null}
      </Row>
    </Pressable>
  );
}

// ---------------------------------------------------------------- feedback

export function ProgressBar({ value, color, height = 8, track }: { value: number; color?: string; height?: number; track?: string }) {
  const c = useColors();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? c.track, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: height, backgroundColor: color ?? c.primary }} />
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md }}>
      <ActivityIndicator color={c.primary} />
      {label ? <Text muted>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ emoji, title, body, action, onAction }: {
  emoji: string;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: space.sm }}>
      <RNText style={{ fontSize: 44 }}>{emoji}</RNText>
      <Text variant="h2" center>
        {title}
      </Text>
      {body ? (
        <Text muted center>
          {body}
        </Text>
      ) : null}
      {action ? <Button title={action} onPress={onAction} variant="secondary" style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useT();
  const code = errorCode(error);
  const detail = (error as { message?: string })?.message ?? String(error);
  return (
    <View style={{ gap: space.sm }}>
      <EmptyState
        emoji="⚠️"
        title={t('errors.title')}
        body={t(`errors.${code}`)}
        action={onRetry ? t('common.retry') : undefined}
        onAction={onRetry}
      />
      {/* The technical reason, so a screenshot is enough to diagnose (also logged to the server) */}
      {code === 'unknown' ? (
        <Text variant="caption" faint center selectable>
          {t('errors.reference', { detail: detail.slice(0, 160) })}
        </Text>
      ) : null}
    </View>
  );
}

export function Banner({ text, color, icon = 'alert-circle' }: { text: string; color: string; icon?: IconName }) {
  const c = useColors();
  // The colour marks the icon; the words stay in the main text colour so they read on any tint
  return (
    <Row
      style={{
        backgroundColor: color + '1A',
        borderRadius: radius.md,
        padding: space.md,
        gap: space.sm,
      }}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text variant="label" color={c.text} style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="label" color={readableOn(color)} style={{ fontSize: size * 0.42 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}
