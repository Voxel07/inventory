/*
 * Typed builders for browser-preview fixtures. Every fixture is checked against the current transport types
 * (`tsc -b` includes tsconfig.fixtures.json), so a removed or renamed DTO field fails type checking instead
 * of silently rendering a stale shape. Deliberately malformed inputs belong in explicitly named adversarial
 * fixtures, never in these builders.
 */
import type { Assembly, Item, StorageLocation, User, UserRole } from '../../src/types';
import type { ItemStock } from '../../src/types/item';

export const FIXTURE_TIME = '2026-10-02T10:00:00Z';

/** The signed-in preview user; previews call `setDevelopmentSession('dev:preview', fixtureUser(role))`. */
export function fixtureUser(role: UserRole): User {
  return { id: 'preview', name: 'Preview user', email: 'preview@example.test', role, roles: [role], faction: [], created: FIXTURE_TIME, updated: FIXTURE_TIME };
}

export function fixtureStock(quantity: number, overrides: Partial<ItemStock> = {}): ItemStock {
  return { totalOwned: quantity, onHand: quantity, checkedOut: 0, inTransit: 0, damaged: 0, reserved: 0, available: quantity, ordered: 0, ...overrides };
}

export function fixtureLocation(fields: Pick<StorageLocation, 'id' | 'name'> & Partial<StorageLocation>): StorageLocation {
  const code = fields.code ?? fields.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  return { active: true, created: FIXTURE_TIME, updated: FIXTURE_TIME, code, fullCode: code, ...fields };
}

export function fixtureItem(fields: Pick<Item, 'id' | 'name'> & Partial<Item>): Item {
  return {
    category: 'Equipment', value: 0, minStock: 0, storageLocation: null, returnLocation: null, status: 'available',
    isConsumable: false, trackingMode: 'bulk', inventoryRole: 'returnable', maintenanceStatus: 'certified', eventTypes: [],
    stock: null, created: FIXTURE_TIME, updated: FIXTURE_TIME, ...fields,
  };
}

export function fixtureAssembly(fields: Pick<Assembly, 'id' | 'name' | 'itemQuantities'> & Partial<Assembly>): Assembly {
  return { description: '', itemIds: Object.keys(fields.itemQuantities), eventTypes: [], created: FIXTURE_TIME, updated: FIXTURE_TIME, ...fields };
}
