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
  heroFrom: '#1E40AF',
  heroTo: '#1D4ED8',
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
  heroFrom: '#1E40AF',
  heroTo: '#1D4ED8',
  overlay: 'rgba(0,0,0,0.6)',
};

export type Colors = typeof light;

// Peak opacity of the white glow on the total card (theme.test.ts checks text contrast with it)
export const HERO_GLOW_OPACITY = 0.1;

export const themes = { light, dark };

export const MEMBER_COLORS = ['#3366FF', '#FF4D88', '#12B76A', '#F79009', '#7A5AF8', '#06AED4'];

// Trip accent colours (Settings › Trip details). Each one swaps the accent
// tokens in light and dark mode; theme.test.ts checks every combination for
// WCAG AA contrast, so only these can be chosen (the database allows the same list).
type Accent = Pick<Colors, 'primary' | 'primaryText' | 'primarySoft' | 'heroFrom' | 'heroTo'>;

export const TRIP_THEMES = {
  blue: {
    light: { primary: light.primary, primaryText: light.primaryText, primarySoft: light.primarySoft, heroFrom: light.heroFrom, heroTo: light.heroTo },
    dark: { primary: dark.primary, primaryText: dark.primaryText, primarySoft: dark.primarySoft, heroFrom: dark.heroFrom, heroTo: dark.heroTo },
  },
  purple: {
    light: { primary: '#6A3AD9', primaryText: '#FFFFFF', primarySoft: '#EFE9FF', heroFrom: '#6A3AD9', heroTo: '#8A35C9' },
    dark: { primary: '#B096FF', primaryText: '#0E1020', primarySoft: '#2A2150', heroFrom: '#4C2BA8', heroTo: '#6B2A9E' },
  },
  green: {
    light: { primary: '#0A7246', primaryText: '#FFFFFF', primarySoft: '#E2F4EA', heroFrom: '#0A7246', heroTo: '#0C6E63' },
    dark: { primary: '#4FD199', primaryText: '#0E1020', primarySoft: '#163A2B', heroFrom: '#0E5C3B', heroTo: '#0C5A52' },
  },
  orange: {
    light: { primary: '#B1430C', primaryText: '#FFFFFF', primarySoft: '#FDEDE3', heroFrom: '#B1430C', heroTo: '#A3360E' },
    dark: { primary: '#FF9C5B', primaryText: '#0E1020', primarySoft: '#3D2416', heroFrom: '#83360C', heroTo: '#7C2D12' },
  },
  pink: {
    light: { primary: '#BC1757', primaryText: '#FFFFFF', primarySoft: '#FCE7F0', heroFrom: '#BC1757', heroTo: '#9C1AA8' },
    dark: { primary: '#FF7AB0', primaryText: '#0E1020', primarySoft: '#3D1A2C', heroFrom: '#8E1546', heroTo: '#761A84' },
  },
  teal: {
    light: { primary: '#0B6E88', primaryText: '#FFFFFF', primarySoft: '#E0F4F8', heroFrom: '#0B6E88', heroTo: '#0D6B64' },
    dark: { primary: '#4CC9E0', primaryText: '#0E1020', primarySoft: '#123540', heroFrom: '#0B5A70', heroTo: '#0B5B55' },
  },
  red: {
    light: { primary: '#C02424', primaryText: '#FFFFFF', primarySoft: '#FDECEC', heroFrom: '#C02424', heroTo: '#A51C1C' },
    dark: { primary: '#FF8080', primaryText: '#0E1020', primarySoft: '#3D1A1A', heroFrom: '#8E1C1C', heroTo: '#7F1D1D' },
  },
  slate: {
    light: { primary: '#3F4A5E', primaryText: '#FFFFFF', primarySoft: '#E9ECF2', heroFrom: '#334155', heroTo: '#475569' },
    dark: { primary: '#AAB5C9', primaryText: '#0E1020', primarySoft: '#262D3B', heroFrom: '#334155', heroTo: '#1E293B' },
  },
} satisfies Record<string, { light: Accent; dark: Accent }>;

export type TripTheme = keyof typeof TRIP_THEMES;

/** Base colours with a trip's accent applied (unknown or missing theme: the default blue). */
export function withTripTheme(base: Colors, mode: 'light' | 'dark', theme: string | null | undefined): Colors {
  const accent = theme && theme in TRIP_THEMES ? TRIP_THEMES[theme as TripTheme][mode] : null;
  return accent ? { ...base, ...accent } : base;
}
