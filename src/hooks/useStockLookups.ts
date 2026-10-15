import { locationPath } from '../utils/locationHierarchy';
import { useItemsByIds } from './useItems';
import { useStorageLocations } from './useStorageLocations';

/**
 * Location options (the complete hierarchy, an explicit full read) and exactly the items the caller references.
 * Item choices come from the server-search picker (`type: 'item'` fields), never from a downloaded catalog.
 */
export function useStockLookups(itemIds: readonly string[] = []) {
  const items = useItemsByIds(itemIds);
  const locations = useStorageLocations();
  return { items: items.data ?? [], locations: locations.data ?? [], error: items.error || locations.error, loading: items.isLoading || locations.isLoading,
    complete: !items.isLoading && !locations.isLoading,
    itemName: (id: string) => items.data?.find((item) => item.id === id)?.name ?? id,
    locationOptions: (locations.data ?? []).map((location) => ({ value: location.id, label: locationPath(location, locations.data ?? []) })),
  };
}
