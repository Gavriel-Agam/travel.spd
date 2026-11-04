// Colour palette (no React Native imports, so tests can check its contrast).
export const light = {
  bg: '#F4F5F9',
  card: '#FFFFFF',
  cardAlt: '#F0F2F7',
  text: '#11142D',
  // Every text colour here reaches WCAG AA (4.5:1) on bg, card and cardAlt (see theme.test.ts)
  textMuted: '#5D6278',
  textFaint: '#666B80',
  border: '#E6E8F0',
  primary: '#2952F0',
  primaryText: '#FFFFFF',
  primarySoft: '#E8EEFF',
  success: '#067A48',
  warning: '#B54708',
  danger: '#CC2B1F',
  dangerSoft: '#FEECEB',
  track: '#EAECF2',
  heroFrom: '#2E5BFF',
  heroTo: '#6A3DF5',
  overlay: 'rgba(17,20,45,0.45)',
};

export const dark: typeof light = {
  bg: '#0E1020',
  card: '#191C2E',
  cardAlt: '#22263B',
  text: '#F2F3F8',
  textMuted: '#A0A4BA',
  textFaint: '#8A8FA8',
  border: '#2A2E45',
  primary: '#7090FF',
  // White on a light enough blue is below 4.5:1, so buttons use dark text here
  primaryText: '#0E1020',
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

export const themes = { light, dark };

export const MEMBER_COLORS = ['#3366FF', '#FF4D88', '#12B76A', '#F79009', '#7A5AF8', '#06AED4'];
