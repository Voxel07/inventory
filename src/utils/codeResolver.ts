import { getFactionOrders, getFactionOrder } from '../services/factionOrderService';
import { getAssetByCode, getItems, getItem, resolveInventoryCode } from '../services/inventoryService';
import { getAssembly } from '../services/assemblyService';

export interface CodeResolutionResult {
  found: boolean;
  type?: 'order' | 'item' | 'assembly' | 'location';
  path?: string;
  name?: string;
  code: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a scanned code (URL, order code e.g. DE26-KGG-01, SKU, or database ID)
 * into a destination route and metadata using targeted queries.
 */
export async function resolveScannedCode(rawCode: string): Promise<CodeResolutionResult> {
  const code = rawCode.trim();
  if (!code) return { found: false, code };

  // 1. Direct URL patterns (instant client-side resolution)
  const orderUrlMatch = code.match(/\/orders\/faction\/([a-zA-Z0-9_-]+)/);
  if (orderUrlMatch?.[1]) {
    return {
      found: true,
      type: 'order',
      path: `/orders/faction/${orderUrlMatch[1]}`,
      code,
    };
  }

  const assetUrlMatch = code.match(/\/items\/([a-zA-Z0-9_-]+)\/assets\/([a-zA-Z0-9_-]+)/);
  if (assetUrlMatch?.[1] && assetUrlMatch?.[2]) {
    return {
      found: true,
      type: 'item',
      path: `/items/${assetUrlMatch[1]}/assets/${assetUrlMatch[2]}`,
      code,
    };
  }

  const itemUrlMatch = code.match(/\/items\/([a-zA-Z0-9_-]+)/);
  if (itemUrlMatch?.[1]) {
    return {
      found: true,
      type: 'item',
      path: `/items/${itemUrlMatch[1]}?transaction=1`,
      code,
    };
  }

  const assemblyUrlMatch = code.match(/\/assemblies\/([a-zA-Z0-9_-]+)/);
  if (assemblyUrlMatch?.[1]) {
    return {
      found: true,
      type: 'assembly',
      path: `/assemblies/${assemblyUrlMatch[1]}`,
      code,
    };
  }

  // 2. Direct Backend Inventory Code Resolution (/api/inventory-codes/resolve/{code})
  try {
    const res = await resolveInventoryCode(code);
    if (res?.targetId) {
      if (res.targetType === 'product') {
        return { found: true, type: 'item', path: `/items/${res.targetId}?transaction=1`, code };
      }
      if (res.targetType === 'assembly') {
        return { found: true, type: 'assembly', path: `/assemblies/${res.targetId}`, code };
      }
      if (res.targetType === 'location') {
        return { found: true, type: 'location', path: '/storage-locations', code };
      }
      if (res.targetType === 'asset') {
        try {
          const asset = await getAssetByCode(code);
          if (asset?.itemId) {
            return {
              found: true,
              type: 'item',
              path: `/items/${asset.itemId}/assets/${asset.id}`,
              name: asset.assetCode,
              code,
            };
          }
        } catch {
          // Fall through
        }
      }
    }
  } catch {
    // Inventory code not found via resolver endpoint; proceed to other targeted checks
  }

  // 3. Asset code lookup (/api/assets/by-code/{code})
  try {
    const asset = await getAssetByCode(code);
    if (asset?.itemId && asset?.id) {
      return {
        found: true,
        type: 'item',
        path: `/items/${asset.itemId}/assets/${asset.id}`,
        name: asset.assetCode,
        code,
      };
    }
  } catch {
    // Not an asset code
  }

  // 4. If code is a direct UUID, check item, assembly, or order by ID
  if (UUID_REGEX.test(code)) {
    try {
      const item = await getItem(code);
      if (item?.id) {
        return { found: true, type: 'item', path: `/items/${item.id}?transaction=1`, name: item.name, code };
      }
    } catch {
      // Not an item UUID
    }

    try {
      const assembly = await getAssembly(code);
      if (assembly?.id) {
        return { found: true, type: 'assembly', path: `/assemblies/${assembly.id}`, name: assembly.name, code };
      }
    } catch {
      // Not an assembly UUID
    }

    try {
      const order = await getFactionOrder(code);
      if (order?.id) {
        return {
          found: true,
          type: 'order',
          path: `/orders/faction/${order.id}`,
          name: order.orderCode || `${order.eventType}-${order.faction}`,
          code,
        };
      }
    } catch {
      // Not an order UUID
    }
  }

  const lowerCode = code.toLowerCase();

  // 5. Targeted Item search (search by SKU, barcode, or name)
  try {
    const items = await getItems({ search: code });
    const matchingItem = items.find(
      (i) =>
        i.sku?.toLowerCase() === lowerCode ||
        i.barcode?.toLowerCase() === lowerCode ||
        i.id.toLowerCase() === lowerCode ||
        i.name.toLowerCase() === lowerCode,
    );
    if (matchingItem) {
      return {
        found: true,
        type: 'item',
        path: `/items/${matchingItem.id}?transaction=1`,
        name: matchingItem.name,
        code,
      };
    }
  } catch (err) {
    console.error('Error searching items for code resolution', err);
  }

  // 6. Faction Order Code check (e.g. DE26-KGG-01, LS26-HEX-01)
  try {
    const orders = await getFactionOrders({ orderCode: code });
    const matchingOrder = orders.find(
      (o) => o.orderCode?.toLowerCase() === lowerCode || o.id.toLowerCase() === lowerCode,
    );
    if (matchingOrder) {
      return {
        found: true,
        type: 'order',
        path: `/orders/faction/${matchingOrder.id}`,
        name: matchingOrder.orderCode || `${matchingOrder.eventType}-${matchingOrder.faction}`,
        code,
      };
    }
  } catch (err) {
    console.error('Error fetching orders for code resolution', err);
  }

  return { found: false, code };
}
