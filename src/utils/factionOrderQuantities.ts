import type { Assembly } from '../types';


export function assemblyAvailability(
  assembly: Assembly,
  availableForItem: (itemId: string) => number,
): number {
  const components = Object.entries(assembly.itemQuantities ?? {}).filter(([, quantity]) => quantity > 0);
  if (!components.length) return 0;
  return Math.max(0, Math.min(...components.map(([itemId, quantity]) => Math.floor(availableForItem(itemId) / quantity))));
}

