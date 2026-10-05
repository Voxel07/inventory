import { expect, test } from 'bun:test';
import type { Assembly, Item } from '../src/types';
import type { MemberCustody } from '../src/types/member';
import { personalAssemblies, personalItems } from '../src/utils/personalItems';

const catalog = [
  { id: 'org', assignedUserId: 'me', access: { privateResource: false, ownerId: 'me' } },
  { id: 'mine', access: { privateResource: true, ownerId: 'me' } },
  { id: 'shared', access: { privateResource: true, ownerId: 'someone-else', canEdit: true } },
  { id: 'checked-out' },
  { id: 'rental' },
  { id: 'returned' },
] as Item[];

test('personal catalog includes owned equipment and active custody, excludes shared and assigned organisation items', () => {
  const custody = [
    { itemId: 'checked-out', personId: 'me', checkedOut: 2, pendingQuantity: 1 },
    { itemId: 'rental', personId: 'me', checkedOut: 1 },
    { itemId: 'returned', personId: 'me', checkedOut: 0 },
    { itemId: 'shared', personId: 'someone-else', checkedOut: 3 },
  ] as MemberCustody[];
  expect(personalItems(catalog, 'me', custody).map(item => item.id)).toEqual(['mine', 'checked-out', 'rental']);
  expect(catalog.map(item => item.id)).toEqual(['org', 'mine', 'shared', 'checked-out', 'rental', 'returned']);
});

test('custody loading does not expose the global catalog and account switching changes ownership immediately', () => {
  expect(personalItems(catalog, 'me', []).map(item => item.id)).toEqual(['mine']);
  expect(personalItems(catalog, 'someone-else', []).map(item => item.id)).toEqual(['shared']);
  expect(personalItems(catalog, undefined, [])).toEqual([]);
});

test('my assemblies are the private assemblies the user owns', () => {
  const assemblies = [
    { id: 'shared-kit', access: { privateResource: false } },
    { id: 'my-kit', access: { privateResource: true, ownerId: 'me' } },
    { id: 'their-kit', access: { privateResource: true, ownerId: 'someone-else', canEdit: true } },
    { id: 'legacy-kit' },
  ] as Assembly[];
  expect(personalAssemblies(assemblies, 'me').map(assembly => assembly.id)).toEqual(['my-kit']);
  expect(personalAssemblies(assemblies, undefined)).toEqual([]);
});
