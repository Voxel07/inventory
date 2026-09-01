import type { AccessRole, EventType, User } from '../types';
import { factionKey } from '../types';

export function effectiveAccess(user: User | null | undefined): AccessRole | 'none' {
  const role = user?.role?.trim().toLowerCase();
  if (role === 'admin') return 'admin';
  if (role === 'manager' || role === 'inventory_manager') return 'inventory_manager';
  return user ? 'faction_leader' : 'none';
}

export function canManageInventory(user: User | null | undefined): boolean {
  return ['admin', 'inventory_manager'].includes(effectiveAccess(user));
}

export function canManageUsers(user: User | null | undefined): boolean {
  return canManageInventory(user);
}

export function canAccessFaction(
  user: User | null | undefined,
  _eventType: EventType,
  faction: string,
): boolean {
  return canManageInventory(user) || Boolean(user?.faction?.includes(faction));
}

export function allowedFactionKeys(user: User | null | undefined): string[] | null {
  if (canManageInventory(user)) return null;
  return user?.faction?.flatMap((assignedFaction) => [
    factionKey('DE', assignedFaction),
    factionKey('LS', assignedFaction),
    factionKey('TNO', assignedFaction),
    factionKey('ASD', assignedFaction),
    factionKey('M24', assignedFaction),
  ]) ?? [];
}
