import { getFactionOrders } from '../services/factionOrderService';
import { getItems } from '../services/inventoryService';
import { getAssemblies } from '../services/assemblyService';

export interface CodeResolutionResult {
  found: boolean;
  type?: 'order' | 'item' | 'assembly';
  path?: string;
  name?: string;
  code: string;
}

/**
 * Resolves a scanned code (URL, order code e.g. DE26-KGG-01, SKU, or database ID)
 * into a destination route and metadata.
 */
export async function resolveScannedCode(rawCode: string): Promise<CodeResolutionResult> {
  const code = rawCode.trim();
  if (!code) return { found: false, code };

  // 1. Direct URL patterns
  const orderUrlMatch = code.match(/\/orders\/faction\/([a-zA-Z0-9_-]+)/);
  if (orderUrlMatch?.[1]) {
    return {
      found: true,
      type: 'order',
      path: `/orders/faction/${orderUrlMatch[1]}`,
      code,
    };
  }

  const itemUrlMatch = code.match(/\/items\/([a-zA-Z0-9_-]+)/);
  if (itemUrlMatch?.[1]) {
    return {
      found: true,
      type: 'item',
      path: `/items/${itemUrlMatch[1]}`,
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

  const lowerCode = code.toLowerCase();

  // 2. Faction Order Code or ID check (e.g. DE26-KGG-01, LS26-HEX-01)
  try {
    const orders = await getFactionOrders();
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

  // 3. Item SKU, barcode, ID, or exact name match
  try {
    const items = await getItems();
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
        path: `/items/${matchingItem.id}`,
        name: matchingItem.name,
        code,
      };
    }
  } catch (err) {
    console.error('Error fetching items for code resolution', err);
  }

  // 4. Assembly ID or exact name match
  try {
    const assemblies = await getAssemblies();
    const matchingAssembly = assemblies.find(
      (a) => a.id.toLowerCase() === lowerCode || a.name.toLowerCase() === lowerCode,
    );
    if (matchingAssembly) {
      return {
        found: true,
        type: 'assembly',
        path: `/assemblies/${matchingAssembly.id}`,
        name: matchingAssembly.name,
        code,
      };
    }
  } catch (err) {
    console.error('Error fetching assemblies for code resolution', err);
  }

  return { found: false, code };
}
