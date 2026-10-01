import type { AccessRole, EventType, User } from '../types';
import { EVENT_TYPES, FACTIONS_BY_EVENT, factionKey } from '../types';

export function effectiveAccess(user: User | null | undefined): AccessRole | 'none' {
  return user?.role ?? 'none';
}

export function canManageInventory(user: User | null | undefined): boolean {
  return ['hq_admin', 'warehouse_crew', 'marshal',
    'event_planner', 'maintenance_crew'].includes(effectiveAccess(user));
}

export function canViewCatalog(user: User | null | undefined): boolean {
  return Boolean(user);
}

export function canEditCatalog(user: User | null | undefined): boolean {
  return ['hq_admin', 'warehouse_crew'].includes(effectiveAccess(user));
}

export function canManageUsers(user: User | null | undefined): boolean {
  return effectiveAccess(user) === 'hq_admin';
}

export const canOperateWarehouse = canEditCatalog;
export function canPerformMaintenance(user: User | null | undefined): boolean {
  return ['hq_admin', 'maintenance_crew'].includes(effectiveAccess(user));
}
export function canPerformCustody(user: User | null | undefined): boolean {
  return ['hq_admin', 'warehouse_crew', 'marshal'].includes(effectiveAccess(user));
}
export function canManagePurchasing(user: User | null | undefined): boolean {
  return ['hq_admin', 'warehouse_crew', 'event_planner'].includes(effectiveAccess(user));
}

export function canAccessProcurement(user: User | null | undefined): boolean {
  return ['hq_admin', 'event_planner'].includes(effectiveAccess(user));
}

export function canAccessFaction(
  user: User | null | undefined,
  eventType: EventType,
  faction: string,
): boolean {
  if (canManageInventory(user) || effectiveAccess(user) === 'read_only') return true;
  const key = factionKey(eventType, faction);
  return Boolean(user?.faction?.some((assignment) => assignment === faction || assignment === key));
}

export function allowedFactionKeys(user: User | null | undefined): string[] | null {
  if (canManageInventory(user) || effectiveAccess(user) === 'read_only') return null;
  return EVENT_TYPES.flatMap((eventType) => FACTIONS_BY_EVENT[eventType]
    .filter((faction) => canAccessFaction(user, eventType, faction))
    .map((faction) => factionKey(eventType, faction)));
}
