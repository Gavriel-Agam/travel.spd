import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { useColors } from '@/theme';
import { Text } from './primitives';

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
