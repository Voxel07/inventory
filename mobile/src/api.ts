import { API_URL } from './config';
import { accessToken } from './auth';
import { getData, setData } from './data';
import type { Asset, Item, TransactionInput } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function request<T>(path: string, options: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${await accessToken()}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 401 && retry) {
    await accessToken(true);
    return request<T>(path, options, false);
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: string; message?: string };
    throw new ApiError(response.status, error.error || error.message || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

async function fetchPages<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < 100; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await request<T[]>(`${path}${separator}page=${page}&size=100`);
    all.push(...batch);
    if (batch.length < 100) return all;
  }
  throw new Error('Catalog is too large to cache completely.');
}

export async function loadItems(): Promise<Item[]> {
  try {
    const items = await fetchPages<Item>('/api/items');
    await setData('catalog.items', JSON.stringify(items));
    return items;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const cached = await getData('catalog.items');
    if (cached) return JSON.parse(cached) as Item[];
    throw error;
  }
}

export async function cachedItems(): Promise<Item[]> {
  const raw = await getData('catalog.items');
  return raw ? JSON.parse(raw) as Item[] : [];
}

export async function loadAssets(itemId: string): Promise<Asset[]> {
  const key = `catalog.assets.${itemId}`;
  try {
    const assets = await fetchPages<Asset>(`/api/items/${encodeURIComponent(itemId)}/assets`);
    await setData(key, JSON.stringify(assets));
    return assets;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const cached = await getData(key);
    if (cached) return JSON.parse(cached) as Asset[];
    throw error;
  }
}

export async function cachedAssets(itemId: string): Promise<Asset[]> {
  const raw = await getData(`catalog.assets.${itemId}`);
  return raw ? JSON.parse(raw) as Asset[] : [];
}

export async function postTransaction(input: TransactionInput, idempotencyKey: string): Promise<void> {
  await request('/api/transactions', { method: 'POST', body: { ...input, idempotencyKey } });
}
