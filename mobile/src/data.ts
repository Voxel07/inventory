import * as storage from './storage';

let accountId = '';

export function setAccountScope(id: string): void { accountId = id; }

function scoped(key: string): string {
  if (!accountId) throw new Error('Inventory account is not selected.');
  return `account.${accountId}.${key}`;
}

export const getData = (key: string) => storage.getData(scoped(key));
export const setData = (key: string, value: string) => storage.setData(scoped(key), value);
