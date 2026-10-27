import { getFactionOrders, getFactionOrder } from '../services/factionOrderService';
import { getAssetByCode, getItem, getItemBySku, getSavedItemByCode, itemApi } from '../services/inventoryService';
import { ApiError } from '../services/apiClient';
import { getAssembly } from '../services/assemblyService';

interface CodeResolutionResult {
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

  const locationMatch = code.match(/\/locations\/([a-zA-Z0-9_-]+)/);
  if (locationMatch?.[1]) return { found: true, type: 'location', path: `/locations/${locationMatch[1]}`, code };

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

  if (!navigator.onLine) {
    const item = await getSavedItemByCode(code);
    return item ? { found: true, type: 'item', path: `/items/${item.id}?transaction=1`, name: item.name, code } : { found: false, code };
  }

  // 2. Asset code lookup (/api/assets/by-code/{code})
  const asset = await absentAs404(getAssetByCode(code));
  if (asset?.itemId && asset.id) {
    return { found: true, type: 'item', path: `/items/${asset.itemId}/assets/${asset.id}`, name: asset.assetCode, code };
  }

  // 3. If code is a direct UUID, check item, assembly, or order by ID
  if (UUID_REGEX.test(code)) {
    const item = await absentAs404(getItem(code));
    if (item?.id) return { found: true, type: 'item', path: `/items/${item.id}?transaction=1`, name: item.name, code };
    const assembly = await absentAs404(getAssembly(code));
    if (assembly?.id) return { found: true, type: 'assembly', path: `/assemblies/${assembly.id}`, name: assembly.name, code };
    const order = await absentAs404(getFactionOrder(code));
    if (order?.id) {
      return { found: true, type: 'order', path: `/orders/faction/${order.id}`, name: order.orderCode || `${order.eventType}-${order.faction}`, code };
    }
  }

  const lowerCode = code.toLowerCase();

  // Exact identity must not depend on the first page of substring matches.
  const exactItem = await absentAs404(getItemBySku(code));
  if (exactItem) return { found: true, type: 'item', path: `/items/${exactItem.id}?transaction=1`, name: exactItem.name, code };

  // 4. Optional exact-name match among the first search results.
  const items = await itemApi.getPage({ search: code }, 0, 25);
  const matchingItem = items.rows.find((item) => item.sku?.toLowerCase() === lowerCode || item.name.toLowerCase() === lowerCode);
  if (matchingItem) {
    return { found: true, type: 'item', path: `/items/${matchingItem.id}?transaction=1`, name: matchingItem.name, code };
  }

  // 5. Faction order code (e.g. DE26-KGG-01, LS26-HEX-01)
  const orders = await getFactionOrders({ orderCode: code }, 0, 10);
  const matchingOrder = orders.rows.find((order) => order.orderCode?.toLowerCase() === lowerCode);
  if (matchingOrder) {
    return { found: true, type: 'order', path: `/orders/faction/${matchingOrder.id}`, name: matchingOrder.orderCode || `${matchingOrder.eventType}-${matchingOrder.faction}`, code };
  }

  return { found: false, code };
}

/**
 * Only "this code is not that kind of resource" lets the lookup continue: 404 (and 400 for a malformed code).
 * Session, permission, network and decoding failures propagate, so they are never reported as "not found".
 */
async function absentAs404<T>(lookup: Promise<T>): Promise<T | null> {
  try {
    return await lookup;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}
