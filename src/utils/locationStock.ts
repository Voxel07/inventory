import type { AssetInstance, Item } from '../types';
import type { Position } from '../types/operations';
import type { StockCalculation } from './stock';

/** Assets already stocked at a location, excluding custody, transit and unconfirmed returns. */
export function isAssetStored(asset: AssetInstance): boolean {
  return asset.active && Boolean(asset.currentLocationId) && asset.conditionStatus !== 'lost'
    && !['in_custody', 'in_field', 'returned_pending_check', 'in_transit', 'lost', 'written_off'].includes(asset.availabilityStatus);
}

/** Aggregate lots and devices into one catalog row per item, with quantities local to this location. */
export function getLocationInventory(items: readonly Item[], positions: readonly Position[], assets: readonly AssetInstance[], locationId: string | null) {
  const bulkStock = new Map<string, StockCalculation>();
  const serializedStock = new Map<string, StockCalculation>();
  const emptyStock = (): StockCalculation => ({ totalStock: 0, remaining: 0, damaged: 0, checkedOut: 0, inTransit: 0 });
  for (const position of positions) {
    if (position.locationId !== locationId || position.quantityOnHand <= 0) continue;
    const stock = bulkStock.get(position.itemId) ?? emptyStock();
    stock.totalStock += position.quantityOnHand;
    stock.remaining += position.availableQuantity;
    stock.damaged += position.quantityDamaged;
    bulkStock.set(position.itemId, stock);
  }
  for (const asset of assets) {
    if (asset.currentLocationId !== locationId || !isAssetStored(asset)) continue;
    const stock = serializedStock.get(asset.itemId) ?? emptyStock();
    stock.totalStock += 1;
    const damaged = ['damaged', 'unsafe'].includes(asset.conditionStatus) || asset.availabilityStatus === 'damaged';
    if (damaged) stock.damaged += 1;
    if (!damaged && asset.availabilityStatus === 'available') stock.remaining += 1;
    serializedStock.set(asset.itemId, stock);
  }
  const stockByItemId = new Map<string, StockCalculation>();
  const storedItems = items.filter(item => {
    const stock = (item.trackingMode === 'serialized' ? serializedStock : bulkStock).get(item.id);
    if (!stock) return false;
    stockByItemId.set(item.id, stock);
    return true;
  });
  return { items: storedItems, stockByItemId };
}
