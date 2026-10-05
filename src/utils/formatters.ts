import { getNames, nameFor } from './naming';

export function formatStatus(status: string): string {
  const value = status.toLowerCase();
  for (const group of ['itemStatus', 'damageStatus', 'severity', 'transactionType'] as const) {
    if (value in getNames()[group]) return nameFor(group, value);
  }
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
