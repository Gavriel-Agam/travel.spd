import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { useT } from '@/i18n';
import { useColorMode } from '@/theme';
import { Text } from './primitives';

/** Apple's mark colours: black on a light screen, white on a dark one. */
export function useApplePayColors() {
  const dark = useColorMode() === 'dark';
  return { bg: dark ? '#FFFFFF' : '#000000', fg: dark ? '#000000' : '#FFFFFF' };
}

/**
 * The Apple Pay mark (Apple logo + "Pay"), used by the pending card, the
 * settings row and the Apple Pay page header. `plain` drops its own pill, for
 * a tile that is already painted in the mark's colour.
 */
export function ApplePayMark({ plain, color }: { plain?: boolean; color?: string }) {
  const { t } = useT();
  const m = useApplePayColors();
  const fg = color ?? m.fg;
  return (
    <View
      accessible
      accessibilityLabel={t('pending.applePay')}
      style={
        {
          flexDirection: 'row',
          direction: 'ltr',
          alignItems: 'center',
          gap: 1,
          height: 22,
          paddingHorizontal: plain ? 0 : 6,
          borderRadius: 5,
          backgroundColor: plain ? 'transparent' : m.bg,
        } as object
      }
    >
      <Ionicons name="logo-apple" size={13} color={fg} />
      <Text variant="caption" color={fg} style={{ fontWeight: '600', fontSize: 12, lineHeight: 14 }}>
        Pay
      </Text>
    </View>
  );
}
