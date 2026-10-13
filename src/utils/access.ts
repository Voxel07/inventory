import { ROLE_LADDER } from '../types';
import type { AccessRole, User } from '../types';

export function effectiveAccess(user: User | null | undefined): AccessRole | 'none' {
  return user?.role ?? 'none';
}

/** Whether the user's role is `minimum` or higher on the role ladder (UX only; the API enforces it). */
export function atLeast(user: User | null | undefined, minimum: AccessRole): boolean {
  const role = effectiveAccess(user);
  return role !== 'none' && ROLE_LADDER.indexOf(role) >= ROLE_LADDER.indexOf(minimum);
}

/** Organization data (public catalog, events, participants, orders); tenants only see their private inventory. */
export function canViewOrganization(user: User | null | undefined): boolean {
  return atLeast(user, 'read_only');
}

/** Warehouse workers: catalog, stock, operations, maintenance, purchasing, preparing orders and history. */
export function canManageInventory(user: User | null | undefined): boolean {
  return atLeast(user, 'warehouse_crew');
}

/** Everyone signed in sees a catalog; tenants see only their own private items. */
export function canViewCatalog(user: User | null | undefined): boolean {
  return Boolean(user);
}

/** Adding items, assemblies and storage locations: everyone except read-only members (tenants add private ones). */
export function canCreateInventory(user: User | null | undefined): boolean {
  return Boolean(user) && effectiveAccess(user) !== 'read_only';
}

export function canEditCatalog(user: User | null | undefined): boolean {
  return atLeast(user, 'warehouse_crew');
}

export function canManageUsers(user: User | null | undefined): boolean {
  return effectiveAccess(user) === 'admin';
}

export const canOperateWarehouse = canEditCatalog;
/** Write-offs permanently reduce owned stock and are reserved to the inventory admin. */
export function canWriteOff(user: User | null | undefined): boolean {
  return effectiveAccess(user) === 'admin';
}
export function canPerformMaintenance(user: User | null | undefined): boolean {
  return atLeast(user, 'warehouse_crew');
}
/** Returns, closing, damage reports and the custody overview (warehouse). */
export function canPerformCustody(user: User | null | undefined): boolean {
  return atLeast(user, 'warehouse_crew');
}
/** ASH crew may take items out and pick up prepared orders. */
export function canTakeOut(user: User | null | undefined): boolean {
  return atLeast(user, 'ash');
}
export function canManagePurchasing(user: User | null | undefined): boolean {
  return atLeast(user, 'warehouse_crew');
}

/** Procurement planning (event deficits) belongs to the inventory admin. */
export function canAccessProcurement(user: User | null | undefined): boolean {
  return effectiveAccess(user) === 'admin';
}

/** Editing events, participants and event timing. */
export function canEditEvents(user: User | null | undefined): boolean {
  return effectiveAccess(user) === 'admin';
}

/** Faction orders (own factions) and self-service for items in one's own custody. */
export function canOrder(user: User | null | undefined): boolean {
  return atLeast(user, 'faction_leader');
}

/** General (non-faction) orders: ASH crew and up. */
export function canUseGeneralOrders(user: User | null | undefined): boolean {
  return atLeast(user, 'ash');
}

/** Membership key of a faction; matches the backend's `EVENT:slug` keys and `FactionOrder.factionKey`. */
export function factionKeyOf(faction: { eventType: string; slug: string }): string {
  return `${faction.eventType.trim().toUpperCase()}:${faction.slug.trim().toLowerCase()}`;
}

/** Every organization member reads every faction's order lists. */
export function canViewFaction(user: User | null | undefined): boolean {
  return canViewOrganization(user);
}

/** Faction leaders change only their own factions' lists; warehouse workers change every list. */
export function canWriteFaction(user: User | null | undefined, factionKey: string): boolean {
  if (atLeast(user, 'warehouse_crew')) return true;
  return atLeast(user, 'faction_leader') && Boolean(user?.faction?.includes(factionKey));
}
