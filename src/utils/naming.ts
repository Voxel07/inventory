import { useSyncExternalStore } from 'react';
import {
  getAppLanguage,
  i18next,
  setAppLanguage,
  subscribeAppLanguage,
  type AppLanguage,
} from '../i18n';

export type { AppLanguage };
export { getAppLanguage, setAppLanguage };

export function useAppLanguage(): AppLanguage {
  return useSyncExternalStore(
    subscribeAppLanguage,
    getAppLanguage,
    (): AppLanguage => 'de',
  );
}

export type NamingGroup =
  | 'itemStatus'
  | 'damageStatus'
  | 'severity'
  | 'transactionType'
  | 'action'
  | 'reason';

const GROUP_VALUES: Record<NamingGroup, readonly string[]> = {
  itemStatus: ['available', 'checked_out', 'damaged', 'retired'],
  damageStatus: ['reported', 'in_review', 'repaired', 'written_off', 'resolved'],
  severity: ['low', 'medium', 'high', 'critical'],
  transactionType: ['checkout', 'checkin', 'added', 'repaired', 'written_off', 'consumed'],
  action: ['checkout', 'checkin', 'scanAgain', 'reset'],
  reason: ['project', 'maintenance', 'testing', 'returnAfterUse', 'restock', 'correction', 'other'],
};

/**
 * Key-based translation hook backed by i18next. Use this for new code:
 *   const t = useT();
 *   t('header.queuedActions', { count: queued })
 */
export function useT() {
  useAppLanguage();
  return i18next.t.bind(i18next);
}

/** Resolves contextual bilingual copy that does not belong to the shared catalog. */
export function useLocalizedText() {
  const language = useAppLanguage();
  return (de: string, en: string): string => (language === 'de' ? de : en);
}

/** Synchronous translation for non-React call sites (errors, module scope). */
export function translate(de: string, en: string): string {
  return getAppLanguage() === 'de' ? de : en;
}

export function nameFor(group: NamingGroup, value: string): string {
  const translated = i18next.t(`enum.${group}.${value}`, { defaultValue: '' });
  if (translated) return translated;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildGroup(group: NamingGroup): Record<string, string> {
  return Object.fromEntries(GROUP_VALUES[group].map((value) => [value, nameFor(group, value)]));
}

/** Returns the resolved label map for the active language (e.g. `names.reason.returnAfterUse`). */
export function getNames() {
  return {
    itemStatus: buildGroup('itemStatus'),
    damageStatus: buildGroup('damageStatus'),
    severity: buildGroup('severity'),
    transactionType: buildGroup('transactionType'),
    action: buildGroup('action'),
    reason: buildGroup('reason'),
  };
}

/** Reactive variant of {@link getNames} for use inside components. */
export function useNames() {
  useAppLanguage();
  return getNames();
}

export function namingOptions<G extends NamingGroup>(group: G) {
  return GROUP_VALUES[group].map((value) => ({ value, label: nameFor(group, value) }));
}
