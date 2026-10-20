import type { Item } from '../types';

/** Typed restock amounts (in the items' steps) as the command's quantities; empty and zero rows are left out. */
export function restockQuantities(value: Record<string, string>): Record<string, number> {
  return Object.fromEntries(Object.entries(value).map(([id, steps]) => [id, Number(steps) || 0]).filter(([, steps]) => Number(steps) > 0));
}

/** Consumables of the order that are still booked as consumed, so unused amounts can come back. */
export function restockableItems(items: Item[], consumed: Record<string, number> | undefined): Item[] {
  return items.filter((item) => item.isConsumable && (consumed?.[item.id] ?? 0) > 0);
}
