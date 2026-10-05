import { getAppLanguage } from '../i18n';

/** Currency display in the app language; amounts are stored and calculated as integer cents. */
export function formatMoney(amount: number, currency = 'EUR'): string {
  const locale = getAppLanguage() === 'de' ? 'de-DE' : 'en-GB';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    // Free-text currency codes on vendor documents need not be valid ISO 4217 codes.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatCents(cents: number, currency = 'EUR'): string {
  return formatMoney(cents / 100, currency);
}
