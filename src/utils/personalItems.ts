import type { Item } from '../types';
import type { MemberCustody } from '../types/member';

/** Catalog access and storage assignments do not imply personal ownership. */
export function personalItems(items: Item[], userId: string | undefined, custody: MemberCustody[]): Item[] {
  if (!userId) return [];
  const held = new Set(custody.filter(row => row.checkedOut > 0 && row.personId === userId).map(row => row.itemId));
  return items.filter(item => (item.access?.privateResource && item.access.ownerId === userId) || held.has(item.id));
}
