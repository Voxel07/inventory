import type { Assembly, FactionOrder } from '../types';

export function expandFactionOrderComponents(
  order: Pick<FactionOrder, 'requestedQuantities' | 'preparedQuantities' | 'requestedAssemblyQuantities' | 'preparedAssemblyQuantities'>,
  assemblies: Assembly[],
  source: 'requested' | 'prepared',
): Record<string, number> {
  const direct = source === 'prepared' ? order.preparedQuantities : order.requestedQuantities;
  const assemblyAmounts = source === 'prepared'
    ? order.preparedAssemblyQuantities
    : order.requestedAssemblyQuantities;
  const result: Record<string, number> = { ...(direct ?? {}) };

  for (const [assemblyId, assemblyCount] of Object.entries(assemblyAmounts ?? {})) {
    if (assemblyCount <= 0) continue;
    const assembly = assemblies.find((candidate) => candidate.id === assemblyId);
    if (!assembly) continue;
    for (const [itemId, perAssembly] of Object.entries(assembly.itemQuantities ?? {})) {
      if (perAssembly <= 0) continue;
      result[itemId] = (result[itemId] ?? 0) + assemblyCount * perAssembly;
    }
  }
  return result;
}

export function assemblyAvailability(
  assembly: Assembly,
  availableForItem: (itemId: string) => number,
): number {
  const components = Object.entries(assembly.itemQuantities ?? {}).filter(([, quantity]) => quantity > 0);
  if (!components.length) return 0;
  return Math.max(0, Math.min(...components.map(([itemId, quantity]) => Math.floor(availableForItem(itemId) / quantity))));
}

