import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';
import en from './en';
import he from './he';

export type Lang = 'en' | 'he';

export function deviceLang(): Lang {
  return getLocales()[0]?.languageCode === 'he' ? 'he' : 'en';
}

export function initI18n(lang: Lang) {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      resources: { en: { translation: en }, he: { translation: he } },
      lng: lang,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  } else if (i18n.language !== lang) {
    i18n.changeLanguage(lang);
  }
}

/**
 * Applies the layout direction for a language. React Native only flips the
 * layout after a reload, so this returns true when a restart is needed.
 */
export function applyDirection(lang: Lang): boolean {
  const rtl = lang === 'he';
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      // Takes effect immediately in the browser; no reload needed
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
    return false;
  }
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export function useT() {
  const { t, i18n: inst } = useTranslation();
  return { t, lang: (inst.language === 'he' ? 'he' : 'en') as Lang };
}

export default i18n;
