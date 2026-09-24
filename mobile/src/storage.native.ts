import { SQLiteStorage } from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';

const database = new SQLiteStorage('ash-inventory-mobile.db');

export const getData = (key: string) => database.getItemAsync(key);
export const setData = (key: string, value: string) => database.setItemAsync(key, value);
export const removeData = async (key: string) => { await database.removeItemAsync(key); };

export const getSecret = (key: string) => SecureStore.getItemAsync(key);
export const setSecret = (key: string, value: string) => SecureStore.setItemAsync(key, value);
export const removeSecret = (key: string) => SecureStore.deleteItemAsync(key);
