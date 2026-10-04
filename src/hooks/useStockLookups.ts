import { locationPath } from '../utils/locationHierarchy';
import { translate } from '../utils/naming';
import { operationsApi } from '../services/operationsService';
import type { Option } from '../components/operations/OperationForm';
import { useItems } from './useItems';
import { useOperationList } from './useOperations';
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

/**
 * Source-location choices for order fulfillment. Returns undefined when there is nothing to choose,
 * i.e. the item is on hand in at most one location and no source was chosen before.
 */
export function useSourceLocationOptions(enabled = true) {
  const lookup = useStockLookups();
  const positions = useOperationList('positions:source-locations', operationsApi.positions(), enabled);
  const onHand = new Map<string, Map<string, number>>();
  for (const position of positions.data ?? []) {
    if (position.quantityOnHand <= 0) continue;
    const locations = onHand.get(position.itemId) ?? new Map<string, number>();
    locations.set(position.locationId, (locations.get(position.locationId) ?? 0) + position.quantityOnHand);
    onHand.set(position.itemId, locations);
  }
  return (itemId: string, selected?: string): Option[] | undefined => {
    const locations = onHand.get(itemId);
    if ((locations?.size ?? 0) < 2 && !selected) return undefined;
    return lookup.locationOptions
      .filter((option) => locations?.has(option.value) || option.value === selected)
      .map((option) => ({ ...option, label: `${option.label} · ${translate('Bestand', 'On hand')}: ${locations?.get(option.value) ?? 0}` }));
  };
}
