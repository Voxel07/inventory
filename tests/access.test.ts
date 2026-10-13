import { describe, expect, test } from 'bun:test';
import { ROLE_LADDER, type User, type UserRole } from '../src/types';
import {
  atLeast, canAccessProcurement, canEditCatalog, canEditEvents, canManageInventory, canManagePurchasing, canManageUsers,
  canOrder, canPerformCustody, canPerformMaintenance, canTakeOut, canUseGeneralOrders, canViewCatalog, canViewFaction,
  canViewOrganization, canWriteFaction, canWriteOff,
} from '../src/utils/access';
import { noticeDetails, notificationPath } from '../src/utils/notifications';
import type { AppNotification } from '../src/services/notificationService';

const user = (role: UserRole, faction: string[] = []): User => ({ id: role, role, roles: [role], name: role, email: `${role}@example.test`, created: '', updated: '', faction });

/** Expected minimum role per capability; the ladder grants it to every higher role. */
const MINIMUM: [string, (u: User) => boolean, UserRole][] = [
  ['catalog', canViewCatalog, 'tenant'],
  ['organization data', canViewOrganization, 'read_only'],
  ['read faction orders', canViewFaction, 'read_only'],
  ['faction orders', canOrder, 'faction_leader'],
  ['general orders', canUseGeneralOrders, 'ash'],
  ['item takeout', canTakeOut, 'ash'],
  ['handing out / custody', canPerformCustody, 'warehouse_crew'],
  ['warehouse', canManageInventory, 'warehouse_crew'],
  ['catalog edits', canEditCatalog, 'warehouse_crew'],
  ['maintenance', canPerformMaintenance, 'warehouse_crew'],
  ['purchasing', canManagePurchasing, 'warehouse_crew'],
  ['procurement', canAccessProcurement, 'admin'],
  ['event planning', canEditEvents, 'admin'],
  ['users', canManageUsers, 'admin'],
  ['write-off', canWriteOff, 'admin'],
];

describe('role ladder', () => {
  test('is ordered from tenant to inventory admin', () => {
    expect([...ROLE_LADDER]).toEqual(['tenant', 'read_only', 'faction_leader', 'ash', 'warehouse_crew', 'admin']);
  });

  for (const [name, check, minimum] of MINIMUM) {
    test(`${name} starts at ${minimum}`, () => {
      for (const role of ROLE_LADDER)
        expect({ role, allowed: check(user(role)) }).toEqual({ role, allowed: ROLE_LADDER.indexOf(role) >= ROLE_LADDER.indexOf(minimum) });
    });
  }

  test('signed-out users have no rights', () => {
    expect(atLeast(null, 'tenant')).toBe(false);
    expect(canViewCatalog(null)).toBe(false);
  });

  test('faction leaders write only their own factions; warehouse writes all; read-only none', () => {
    expect(canWriteFaction(user('faction_leader', ['DE:kgg']), 'DE:kgg')).toBe(true);
    expect(canWriteFaction(user('faction_leader', ['DE:kgg']), 'DE:other')).toBe(false);
    expect(canWriteFaction(user('ash', ['DE:kgg']), 'DE:other')).toBe(false);
    expect(canWriteFaction(user('warehouse_crew'), 'DE:other')).toBe(true);
    expect(canWriteFaction(user('read_only', ['DE:kgg']), 'DE:kgg')).toBe(false);
    expect(canWriteFaction(user('tenant', ['DE:kgg']), 'DE:kgg')).toBe(false);
  });
});

describe('item request notifications', () => {
  const notice = (type: string, payload: Record<string, unknown>): AppNotification => ({ id: 'n', type, payload, createdAt: '', readAt: null } as unknown as AppNotification);

  test('open the requested item and show the request source', () => {
    const requested = notice('item_requested', { path: '/items/abc', itemName: 'Generator', requesterName: 'Ada', reference: 'DE-2026-KGG-1' });
    expect(notificationPath(requested)).toBe('/items/abc');
    expect(noticeDetails(requested)).toBe('DE-2026-KGG-1');
  });

  test('keep order notices pointing at orders', () => {
    expect(notificationPath(notice('order_ready', { path: '/orders?tab=general' }))).toBe('/orders?tab=general');
    expect(notificationPath(notice('order_ready', { path: 'https://example.test/' }))).toBeUndefined();
  });
});
