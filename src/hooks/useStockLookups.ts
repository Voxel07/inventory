import { locationPath } from '../utils/locationHierarchy';
import { useItems } from './useItems';
import { useStorageLocations } from './useStorageLocations';

export function useStockLookups() {
  const items = useItems();
  const locations = useStorageLocations();
  return { items: items.data ?? [], locations: locations.data ?? [], error: items.error || locations.error, loading: items.isLoading || locations.isLoading,
    complete: items.isComplete && !locations.isLoading,
    itemOptions: (items.data ?? []).map((item) => ({ value: item.id, label: `${item.name}${item.sku ? ` · ${item.sku}` : ''}` })),
    locationOptions: (locations.data ?? []).map((location) => ({ value: location.id, label: locationPath(location, locations.data ?? []) })),
  };
}
