const protectedResponses = new WeakSet<object>();
const privateResourceIds = new Set<string>();

export function clearPrivateResourceIds(): void { privateResourceIds.clear(); }

export function markPrivateInventoryResponse(value: unknown): void {
  const explicit = hasPrivacyFlag(value);
  function remember(child: unknown, inherited: boolean): void {
    if (!child || typeof child !== 'object') return;
    protectedResponses.add(child);
    if (Array.isArray(child)) { child.forEach(row => remember(row, inherited)); return; }
    const record = child as Record<string, unknown>;
    const access = record.access as { privateResource?: boolean } | undefined;
    const privateRecord = access?.privateResource ?? (typeof record.privateResource === 'boolean' ? record.privateResource : inherited);
    if (privateRecord && typeof record.id === 'string') privateResourceIds.add(record.id);
    Object.values(record).forEach(nested => remember(nested, privateRecord));
  }
  // Mixed catalog pages expose explicit policies; remember only private IDs for offline-write prevention.
  // Older operational projections carry the response header, so their IDs are conservatively protected.
  remember(value, !explicit);
}

function hasPrivacyFlag(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasPrivacyFlag);
  const record = value as Record<string, unknown>;
  return record.privateResource === true || Object.values(record).some(hasPrivacyFlag);
}

export function referencesPrivateInventory(value: unknown): boolean {
  if (typeof value === 'string') return [...privateResourceIds].some(id => value.includes(id));
  if (!value || typeof value !== 'object') return false;
  return containsPrivateInventory(value) || Object.entries(value).some(([key, child]) =>
    privateResourceIds.has(key) || referencesPrivateInventory(child));
}

export function containsPrivateInventory(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (protectedResponses.has(value)) return true;
  if (Array.isArray(value)) return value.some(containsPrivateInventory);
  const record = value as Record<string, unknown>;
  return record.privateResource === true || Object.values(record).some(containsPrivateInventory);
}
