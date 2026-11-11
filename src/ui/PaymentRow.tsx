import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { fitInRow, paymentIcon, paymentLabel } from '@/lib/payments';
import { space, useColors } from '@/theme';
import { Chip, Text, tap } from './primitives';

const GAP = space.sm;
const PLUS = 36;

/**
 * Payment methods on a single line: as many chips as fit, then a round "+".
 * The "+" opens the full list (the methods that didn't fit, and adding the
 * trip's own); a small number on it says how many are tucked away. The chosen
 * method always stays in view.
 */
export function PaymentRow({ keys, selected, onSelect, onMore }: {
  keys: string[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  onMore: (hidden: string[]) => void;
}) {
  const { t } = useT();
  const c = useColors();
  const [rowWidth, setRowWidth] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const measured = rowWidth > 0 && keys.every((k) => widths[k] != null);
  const shown = useMemo(
    () => (measured ? fitInRow(keys, widths, rowWidth - PLUS - GAP, GAP, selected) : keys),
    [measured, keys.join('|'), widths, rowWidth, selected],
  );
  const hidden = keys.filter((k) => !shown.includes(k));
  const chip = (key: string) => (
    <Chip icon={paymentIcon(key)} label={paymentLabel(key, t)} selected={selected === key} onPress={() => onSelect(selected === key ? null : key)} />
  );

  return (
    <View onLayout={(e) => setRowWidth(Math.floor(e.nativeEvent.layout.width))}>
      {/* Every chip measured once, out of sight (clipped to nothing), to know how many fit */}
      <View
        pointerEvents="none"
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={{ position: 'absolute', top: 0, start: 0, end: 0, height: 0, overflow: 'hidden', opacity: 0 }}
      >
        <View style={{ flexDirection: 'row' }}>
        {keys.map((k) => (
          <View
            key={k}
            onLayout={(e) => {
              const w = Math.ceil(e.nativeEvent.layout.width);
              setWidths((prev) => (prev[k] === w ? prev : { ...prev, [k]: w }));
            }}
          >
            {chip(k)}
          </View>
        ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP, opacity: measured ? 1 : 0 }}>
        {shown.map((k) => (
          <View key={k}>{chip(k)}</View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden.length ? t('payment.moreA11y', { count: hidden.length }) : t('payment.addTitle')}
          onPress={() => {
            tap();
            onMore(hidden);
          }}
          hitSlop={6}
          style={({ pressed }) => ({
            width: PLUS,
            height: PLUS,
            borderRadius: PLUS / 2,
            backgroundColor: c.cardAlt,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Ionicons name="add" size={20} color={c.primary} />
          {hidden.length ? (
            <View
              style={{
                position: 'absolute',
                top: -3,
                end: -3,
                minWidth: 17,
                height: 17,
                paddingHorizontal: 4,
                borderRadius: 9,
                backgroundColor: c.primary,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: c.card,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 12 }}>{hidden.length}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

