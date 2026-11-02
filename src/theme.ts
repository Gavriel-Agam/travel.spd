import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F5F9',
  card: '#FFFFFF',
  cardAlt: '#F0F2F7',
  text: '#11142D',
  textMuted: '#6B7086',
  textFaint: '#A3A7B9',
  border: '#E6E8F0',
  primary: '#3366FF',
  primaryText: '#FFFFFF',
  primarySoft: '#E8EEFF',
  success: '#17B26A',
  warning: '#F79009',
  danger: '#F04438',
  dangerSoft: '#FEECEB',
  track: '#EAECF2',
  heroFrom: '#2E5BFF',
  heroTo: '#6A3DF5',
  overlay: 'rgba(17,20,45,0.45)',
};

const dark: typeof light = {
  bg: '#0E1020',
  card: '#191C2E',
  cardAlt: '#22263B',
  text: '#F2F3F8',
  textMuted: '#A0A4BA',
  textFaint: '#6B7086',
  border: '#2A2E45',
  primary: '#5C85FF',
  primaryText: '#FFFFFF',
  primarySoft: '#1E2A55',
  success: '#32D583',
  warning: '#FDB022',
  danger: '#F97066',
  dangerSoft: '#3A1D1D',
  track: '#2A2E45',
  heroFrom: '#2747C9',
  heroTo: '#5530C9',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const MEMBER_COLORS = ['#3366FF', '#FF4D88', '#12B76A', '#F79009', '#7A5AF8', '#06AED4'];

export function alertColor(c: Colors, level: number) {
  if (level >= 100) return c.danger;
  if (level >= 90) return c.danger;
  if (level >= 75) return c.warning;
  return c.primary;
}
