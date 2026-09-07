import i18next from 'i18next';
import en from './en';
import de from './de';

export type AppLanguage = 'de' | 'en';

const STORAGE_KEY = 'inventory-language';
const listeners = new Set<() => void>();

function initialLanguage(): AppLanguage {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'en') return 'en';
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return import.meta.env.VITE_APP_LANGUAGE === 'en' ? 'en' : 'de';
}

let activeLanguage: AppLanguage = initialLanguage();
document.documentElement.lang = activeLanguage;

void i18next.init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: activeLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

i18next.on('languageChanged', (lng) => {
  activeLanguage = lng === 'en' ? 'en' : 'de';
  document.documentElement.lang = lng;
  listeners.forEach((listener) => listener());
});

export function getAppLanguage(): AppLanguage {
  return activeLanguage;
}

export function setAppLanguage(language: AppLanguage): void {
  if (language === activeLanguage) return;
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Keep the in-memory selection even when persistence is unavailable.
  }
  void i18next.changeLanguage(language);
}

export function subscribeAppLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export { i18next };
