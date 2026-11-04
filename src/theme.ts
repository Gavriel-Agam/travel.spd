import { useColorScheme } from 'react-native';
import { dark, light, type Colors } from './palette';

export { MEMBER_COLORS, themes, type Colors } from './palette';

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export function alertColor(c: Colors, level: number) {
  if (level >= 100) return c.danger;
  if (level >= 90) return c.danger;
  if (level >= 75) return c.warning;
  return c.primary;
}
