import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, withTripTheme, type Colors } from './palette';
import { useTripLook } from './store/tripLook';

export { MEMBER_COLORS, themes, type Colors } from './palette';

/** The app's colours, with the active trip's accent colour applied. */
export function useColors(): Colors {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useTripLook((s) => s.theme);
  return useMemo(() => withTripTheme(mode === 'dark' ? dark : light, mode, theme), [mode, theme]);
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export function alertColor(c: Colors, level: number) {
  if (level >= 100) return c.danger;
  if (level >= 90) return c.danger;
  if (level >= 75) return c.warning;
  return c.primary;
}
