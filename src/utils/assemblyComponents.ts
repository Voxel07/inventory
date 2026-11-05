import type { Assembly, AssemblyFormData, Item } from '../types';
import { quantityScale } from './stock';

/** Component edits use the same complete write contract as the assembly form. */
function componentUpdate(assembly: Assembly, itemQuantities: Record<string, number>): AssemblyFormData {
  return {
    name: assembly.name,
    category: assembly.category,
    subcategory: assembly.subcategory,
    description: assembly.description,
    hint: assembly.hint,
    eventTypes: assembly.eventTypes,
    itemIds: Object.keys(itemQuantities),
    itemQuantities,
  };
}

export function addAssemblyComponent(assembly: Assembly, item: Item): AssemblyFormData {
  return componentUpdate(assembly, {
    ...assembly.itemQuantities,
    [item.id]: assembly.itemQuantities[item.id] ?? quantityScale(item),
  });
}

export function removeAssemblyComponent(assembly: Assembly, itemId: string): AssemblyFormData {
  const itemQuantities = { ...assembly.itemQuantities };
  delete itemQuantities[itemId];
  return componentUpdate(assembly, itemQuantities);
}
