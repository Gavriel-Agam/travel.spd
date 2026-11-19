import { useEffect, useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { dark, light, withTripTheme, type Colors } from './palette';
import { usePrefs } from './store/prefs';
import { useTripLook } from './store/tripLook';

/** Kept for public/index.html, which paints the page before the app starts. */
export const THEME_STORAGE_KEY = 'smarttrip-theme';

/** Light or dark: the mode chosen in the app (Home › gear), else the device's. */
export function useColorMode(): 'light' | 'dark' {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  return usePrefs((s) => s.themeMode) ?? system;
}

/** Web: the page behind the app, the browser bar colour and the launch screen follow the mode. */
export function useWebTheme() {
  const mode = useColorMode();
  const chosen = usePrefs((s) => s.themeMode);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const bg = (mode === 'dark' ? dark : light).bg;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.documentElement.style.colorScheme = mode;
    if (chosen) document.documentElement.setAttribute('data-theme', chosen);
    else document.documentElement.removeAttribute('data-theme');
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
    try {
      if (chosen) localStorage.setItem(THEME_STORAGE_KEY, chosen);
      else localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // storage blocked: the page just starts in the device's mode
    }
  }, [mode, chosen]);
}

export { MEMBER_COLORS, themes, type Colors } from './palette';

/** The app's colours, with the active trip's accent colour applied. */
export function useColors(): Colors {
  const mode = useColorMode();
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
