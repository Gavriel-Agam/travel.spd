import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { radius, space, useColors } from '@/theme';
import { Text, type IconName } from './primitives';

/**
 * One group of related settings (Trip settings: General, Destinations & VAT,
 * Budget & currency, Participants): a soft card with an icon and a heading,
 * read out as a heading by screen readers.
 */
export function SettingsGroup({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.cardAlt, borderRadius: radius.lg, padding: space.md, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={17} color={c.primary} />
        </View>
        <Text variant="label" accessibilityRole="header" style={{ fontWeight: '700' }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}
