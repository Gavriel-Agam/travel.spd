import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import { Text, tap, type IconName } from './primitives';
import { Sheet } from './Sheet';

type Item = { key: string; icon: IconName; ready: boolean };

// Smart import and Arrange work today; the others are on the way (greyed out, "Coming soon")
const ITEMS: Item[] = [
  { key: 'smartImport', icon: 'sparkles-outline', ready: true },
  { key: 'arrange', icon: 'swap-vertical', ready: true },
  { key: 'export', icon: 'download-outline', ready: false },
  { key: 'share', icon: 'share-social-outline', ready: false },
  { key: 'filter', icon: 'filter-outline', ready: false },
  { key: 'theme', icon: 'contrast-outline', ready: false },
];

/** The gear menu on Home's top bar. */
export function HomeMenu({
  visible,
  onClose,
  onArrange,
  onSmartImport,
  importBadge,
}: {
  visible: boolean;
  onClose: () => void;
  onArrange: () => void;
  onSmartImport: () => void;
  /** A Smart import waiting on this device: shown next to the item. */
  importBadge: 'ready' | 'queued' | 'error' | null;
}) {
  const c = useColors();
  const { t } = useT();
  // The disabled item tapped last: shows a "Coming soon" bubble for a moment
  const [soon, setSoon] = useState<string | null>(null);
  useEffect(() => {
    if (!soon) return;
    const id = setTimeout(() => setSoon(null), 1600);
    return () => clearTimeout(id);
  }, [soon]);

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setSoon(null);
        onClose();
      }}
      title={t('home.menu.title')}
    >
      <View style={{ padding: space.lg, gap: space.xs }}>
        {ITEMS.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ disabled: !item.ready }}
            accessibilityHint={item.ready ? undefined : t('home.menu.soon')}
            onPress={() => {
              tap();
              if (!item.ready) return setSoon(item.key);
              if (item.key === 'arrange') onArrange();
              if (item.key === 'smartImport') onSmartImport();
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              minHeight: 52,
              paddingHorizontal: space.md,
              borderRadius: radius.md,
              backgroundColor: pressed && item.ready ? c.cardAlt : 'transparent',
            })}
          >
            <View style={{ opacity: item.ready ? 1 : 0.4, flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 }}>
              <Ionicons name={item.icon} size={22} color={item.ready ? c.primary : c.textMuted} />
              <Text style={{ flex: 1, fontWeight: '600' }} color={item.ready ? c.text : c.textMuted}>
                {t(`home.menu.${item.key}`)}
              </Text>
            </View>
            {item.key === 'smartImport' && importBadge ? (
              <ImportBadge status={importBadge} />
            ) : soon === item.key ? (
              <View style={{ backgroundColor: c.text, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text variant="caption" color={c.card} style={{ fontWeight: '700' }}>
                  {t('home.menu.soon')}
                </Text>
              </View>
            ) : !item.ready ? (
              <Ionicons name="time-outline" size={16} color={c.textFaint} />
            ) : null}
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** "Queued offline" / "Ready for review" / "Failed" next to Smart import. */
export function ImportBadge({ status }: { status: 'ready' | 'queued' | 'error' }) {
  const c = useColors();
  const { t } = useT();
  const color = status === 'ready' ? c.primary : status === 'error' ? c.danger : c.textMuted;
  const label = t(status === 'ready' ? 'smartImport.badgeReady' : status === 'error' ? 'smartImport.badgeError' : 'smartImport.badgeQueued');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: color + '1F' }}>
      <Ionicons name={status === 'ready' ? 'checkmark-circle' : status === 'error' ? 'alert-circle' : 'cloud-offline-outline'} size={13} color={color} />
      <Text variant="caption" color={color} style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </View>
  );
}
