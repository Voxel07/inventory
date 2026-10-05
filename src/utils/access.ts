import type { AccessRole, User } from '../types';

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

/** Membership key of a faction; matches the backend's `EVENT:slug` keys and `FactionOrder.factionKey`. */
export function factionKeyOf(faction: { eventType: string; slug: string }): string {
  return `${faction.eventType.trim().toUpperCase()}:${faction.slug.trim().toLowerCase()}`;
}

/** Only faction leaders are limited to the factions of their identity-provider groups (UX only; the API enforces it). */
export function canAccessFaction(user: User | null | undefined, factionKey: string): boolean {
  if (canManageInventory(user) || effectiveAccess(user) === 'read_only') return true;
  return Boolean(user?.faction?.includes(factionKey));
}
