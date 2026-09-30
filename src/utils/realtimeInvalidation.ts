import type { QueryClient } from '@tanstack/react-query';
import type { ApiChangeDetail } from '../services/apiClient';

import { stockQueryPrefixes } from './queryKeys';

/**
 * Maps a server-sent change event (or a local write, signalled by an empty
 * detail) to affected operational query domains.
 *
 * Local writes and unknown events fall back to invalidating everything, which
 * keeps correctness while realtime events from the backend stay targeted.
 */
export function invalidateForApiChange(queryClient: QueryClient, detail?: ApiChangeDetail): void {
  const prefixes: string[][] = stockQueryPrefixes.map((key) => [key]);

  if (!detail?.type) {
    void queryClient.invalidateQueries();
    return;
  } else if (detail.type === 'catalog.changed') {
    switch (detail.resource) {
      case 'items':
        // Item creation/amount edits can create an initial stock transaction.
        prefixes.push(['items'], ['transactions'], ['procurement-deficits']);
        break;
      case 'category-maintenance':
        prefixes.push(['category-maintenance'], ['items'], ['assemblies']);
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
    void queryClient.invalidateQueries();
    return;
  }

  for (const prefix of new Set(prefixes.map(([key]) => key))) void queryClient.invalidateQueries({ queryKey: [prefix] });
}
