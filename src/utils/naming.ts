import { useSyncExternalStore } from 'react';

export const NAMING = {
  de: {
    itemStatus: { available: 'Verfügbar', checked_out: 'Ausgeliehen', damaged: 'Beschädigt', retired: 'Ausgemustert' },
    damageStatus: { reported: 'Gemeldet', in_review: 'In Prüfung', repaired: 'Repariert', written_off: 'Abgeschrieben' },
    severity: { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', critical: 'Kritisch' },
    transactionType: { checkout: 'Ausleihe', checkin: 'Rückgabe', added: 'Bestand hinzufügen' },
    action: { checkout: 'Ausleihen', checkin: 'Zurückgeben', scanAgain: 'Neu scannen', reset: 'Zurücksetzen' },
    reason: {
      project: 'Projektnutzung', maintenance: 'Wartung', testing: 'Testen',
      returnAfterUse: 'Rückgabe nach Nutzung', restock: 'Lageraufstockung',
      correction: 'Bestandskorrektur', other: 'Sonstiges',
    },
  },
  en: {
    itemStatus: { available: 'Available', checked_out: 'Checked out', damaged: 'Damaged', retired: 'Retired' },
    damageStatus: { reported: 'Reported', in_review: 'In review', repaired: 'Repaired', written_off: 'Written off' },
    severity: { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' },
    transactionType: { checkout: 'Checkout', checkin: 'Return', added: 'Add stock' },
    action: { checkout: 'Check out', checkin: 'Return', scanAgain: 'Scan again', reset: 'Reset' },
    reason: {
      project: 'Project use', maintenance: 'Maintenance', testing: 'Testing',
      returnAfterUse: 'Return after use', restock: 'Restock',
      correction: 'Stock correction', other: 'Other',
    },
  },
} as const;

export type AppLanguage = keyof typeof NAMING;
const STORAGE_KEY = 'inventory-language';
let activeLanguage: AppLanguage = localStorage.getItem(STORAGE_KEY) === 'en'
  ? 'en'
  : import.meta.env.VITE_APP_LANGUAGE === 'en' ? 'en' : 'de';
const listeners = new Set<() => void>();
document.documentElement.lang = activeLanguage;

export function getAppLanguage(): AppLanguage { return activeLanguage; }
export function getNames() { return NAMING[activeLanguage]; }
export function setAppLanguage(language: AppLanguage) {
  if (language === activeLanguage) return;
  activeLanguage = language;
  localStorage.setItem(STORAGE_KEY, language);
  document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}
export function useAppLanguage(): AppLanguage {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    getAppLanguage,
    (): AppLanguage => 'de',
  );
}
export function useNames() {
  return NAMING[useAppLanguage()];
}

export function translate(de: string, en: string): string {
  return activeLanguage === 'de' ? de : en;
}

export function useTranslate() {
  const language = useAppLanguage();
  return (de: string, en: string): string => language === 'de' ? de : en;
}

export type NamingGroup = 'itemStatus' | 'damageStatus' | 'severity' | 'transactionType' | 'action' | 'reason';

export function nameFor(group: NamingGroup, value: string): string {
  const table = getNames()[group] as Record<string, string>;
  return table[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function namingOptions<G extends NamingGroup>(group: G) {
  return Object.entries(getNames()[group]).map(([value, label]) => ({ value, label }));
}
