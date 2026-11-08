/** Shop host of a purchase link (lower case, without `www.`), or null unless it is an absolute http(s) address. Mirrors the server. */
export function purchaseHost(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!host.includes('.')) return null;
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/** Empty, or a complete http(s) address of at most 2048 characters. */
export const validPurchaseUrl = (value: string | null | undefined) => !value?.trim() || (value.trim().length <= 2048 && purchaseHost(value) !== null);
