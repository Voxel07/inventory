import type { QueryClient } from '@tanstack/react-query';
import type { ApiChangeDetail } from '../services/apiClient';

const ALL_PREFIXES: string[][] = [
  ['items'],
  ['assemblies'],
  ['storageLocations'],
  ['event-reports'],
  ['faction-orders'],
  ['transactions'],
  ['damageReports'],
  ['procurement-deficits'],
  ['users'],
  ['general-orders'],
  ['notifications'],
];

/**
 * Maps a server-sent change event (or a local write, signalled by an empty
 * detail) to the smallest set of query keys that must be refetched.
 *
 * Local writes and unknown events fall back to invalidating everything, which
 * keeps correctness while realtime events from the backend stay targeted.
 */
export function invalidateForApiChange(queryClient: QueryClient, detail?: ApiChangeDetail): void {
  const prefixes: string[][] = [];

  if (!detail?.type) {
    prefixes.push(...ALL_PREFIXES.map((prefix) => [...prefix]));
  } else if (detail.type === 'catalog.changed') {
    switch (detail.resource) {
      case 'items':
        // Item creation/amount edits can create an initial stock transaction.
        prefixes.push(['items'], ['transactions'], ['procurement-deficits']);
        break;
      case 'assemblies':
        prefixes.push(['assemblies'], ['faction-orders'], ['procurement-deficits']);
        break;
      case 'storage-locations':
        prefixes.push(['storageLocations'], ['items']);
        break;
      case 'events':
        prefixes.push(['event-reports']);
        break;
      case 'factions':
        prefixes.push(['faction-orders']);
        break;
      default:
        prefixes.push(['items'], ['assemblies'], ['storageLocations'], ['event-reports'], ['faction-orders']);
    }
  } else if (detail.type === 'stock.changed') {
    prefixes.push(['transactions'], ['items'], ['damageReports'], ['procurement-deficits']);
  } else if (detail.type === 'order.changed' || detail.type === 'order.transition') {
    prefixes.push(['faction-orders'], ['transactions'], ['items'], ['damageReports'], ['procurement-deficits']);
  } else {
    prefixes.push(...ALL_PREFIXES.map((prefix) => [...prefix]));
  }

  for (const prefix of prefixes) queryClient.invalidateQueries({ queryKey: prefix });
}
