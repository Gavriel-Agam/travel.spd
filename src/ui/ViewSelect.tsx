import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import type { HomeView } from '@/store/prefs';
import { radius, space, useColors } from '@/theme';
import { Text, tap } from './primitives';
import { Sheet } from './Sheet';

const VIEWS: HomeView[] = ['trip', 'mine'];
const ICON: Record<HomeView, string> = { trip: '👥', mine: '🙋' };

/**
 * A small "▾ Whole trip" pill for the top corner of a Home card (its end:
 * top left in Hebrew). Tap it to choose what the card shows: the whole trip,
 * or your share (your personal expenses plus your part of shared ones).
 */
export function ViewSelect({
  value,
  onChange,
  title,
  color,
  compact = false,
}: {
  value: HomeView;
  onChange: (v: HomeView) => void;
  /** The card's name, shown on top of the choices. */
  title: string;
  /** Text colour (the total card has its own); defaults to the accent colour. */
  color?: string;
  /** Short label, for the half-width cards. */
  compact?: boolean;
}) {
  const c = useColors();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ink = color ?? c.primary;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${t(`home.view.${value}`)}`}
        onPress={() => {
          tap();
          setOpen(true);
        }}
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 0 : 2,
          paddingHorizontal: compact ? 4 : 8,
          paddingVertical: 3,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: ink + '55',
          backgroundColor: pressed ? ink + '22' : 'transparent',
          flexShrink: 0,
        })}
      >
        {/* Half-width cards: just the icon (👥 whole trip, 🙋 my share) */}
        <Text variant="caption" color={ink} style={{ fontWeight: '600', fontSize: compact ? 12 : undefined }} numberOfLines={1}>
          {compact ? ICON[value] : `${ICON[value]} ${t(`home.view.${value}`)}`}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 10 : 12} color={ink} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={{ padding: space.lg, gap: space.sm }}>
          {VIEWS.map((v) => {
            const on = v === value;
            return (
              <Pressable
                key={v}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tap();
                  onChange(v);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.md,
                  borderRadius: radius.md,
                  backgroundColor: on ? c.primarySoft : pressed ? c.cardAlt : c.cardAlt,
                })}
              >
                <Text style={{ fontSize: 20 }}>{ICON[v]}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontWeight: '600' }}>{t(`home.view.${v}`)}</Text>
                  <Text variant="caption" muted>
                    {t(`home.view.${v}Hint`)}
                  </Text>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={22} color={c.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}
