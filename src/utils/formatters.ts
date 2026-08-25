import { getNames, nameFor } from './naming';

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatStatus(status: string): string {
  const value = status.toLowerCase();
  for (const group of ['itemStatus', 'damageStatus', 'severity', 'transactionType'] as const) {
    if (value in getNames()[group]) return nameFor(group, value);
  }
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
