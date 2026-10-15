import { useSyncExternalStore } from 'react';
import type { Translator } from '../i18n/types';
import {
  getAppLanguage,
  i18next,
  setAppLanguage,
  subscribeAppLanguage,
  type AppLanguage,
} from '../i18n';

export type { AppLanguage };
export type { TranslationKey, TranslationOptions, Translator } from '../i18n/types';
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
  | 'reason'
  | 'value';

const GROUP_VALUES: Record<NamingGroup, readonly string[]> = {
  itemStatus: ['available', 'checked_out', 'damaged', 'retired'],
  damageStatus: ['reported', 'in_review', 'repaired', 'written_off', 'resolved'],
  severity: ['low', 'medium', 'high', 'critical', 'total_loss'],
  transactionType: [
    'checkout', 'checkin', 'added', 'repaired', 'written_off', 'consumed', 'received', 'adjusted', 'reserved',
    'reservation_released', 'transfer_out', 'transfer_in', 'staged', 'damaged', 'missing',
  ],
  action: ['checkout', 'checkin', 'scanAgain', 'reset'],
  reason: ['eventUse', 'project', 'maintenance', 'testing', 'returnAfterUse', 'restock', 'correction', 'other'],
  value: [],
};

/**
 * Key-based translation hook backed by i18next. Use this for new code:
 *   const t = useT();
 *   t('header.queuedActions', { count: queued })
 */
export function useT(): Translator {
  return translators[useAppLanguage()];
}

/** Synchronous translation for non-React call sites (errors, module scope). */
export const translate: Translator = (key, options) => i18next.t(key, options);

// Keep callbacks and asynchronous exports in the language selected when they start.
const translators: Record<AppLanguage, Translator> = {
  de: (key, options) => i18next.t(key, { ...options, lng: 'de' }),
  en: (key, options) => i18next.t(key, { ...options, lng: 'en' }),
};

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
