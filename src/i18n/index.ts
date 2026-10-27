import i18next from 'i18next';

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
if (typeof document !== 'undefined') document.documentElement.lang = activeLanguage;

// Only the active catalog is downloaded; `bun run lint` (check:i18n) keeps DE and EN key-complete, so no fallback is needed.
const catalogs = { de: () => import('./de'), en: () => import('./en') } as const;

async function loadCatalog(language: AppLanguage): Promise<void> {
  if (i18next.hasResourceBundle(language, 'translation')) return;
  i18next.addResourceBundle(language, 'translation', (await catalogs[language]()).default);
}

const ready = i18next.init({
  resources: {},
  lng: activeLanguage,
  fallbackLng: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
}).then(() => loadCatalog(activeLanguage));

/** Resolves once the active language's catalog is loaded; the app renders only after it. */
export function initializeI18n(): Promise<void> {
  return ready;
}

i18next.on('languageChanged', (lng) => {
  activeLanguage = lng === 'en' ? 'en' : 'de';
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
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
  // Offline before this catalog was ever downloaded, the current language stays.
  void loadCatalog(language).then(() => i18next.changeLanguage(language))
    .catch((error: unknown) => console.error('Could not load the language catalog', error));
}

export function subscribeAppLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export { i18next };
