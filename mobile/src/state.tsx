import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { restoreSession, signIn, signOut } from './auth';
import { ApiError, cachedAssets, cachedItems, loadAssets, loadItems, request } from './api';
import { checkConfig } from './config';
import { setAccountScope } from './data';
import { InventoryContext } from './inventoryContext';
import { discardIssue, flush, queuedActions, submit, syncIssues } from './sync';
import type { Asset, Item, Session, SyncIssue, TransactionInput } from './types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [issues, setIssues] = useState<SyncIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const counts = useCallback(async () => {
    const [queue, failures] = await Promise.all([queuedActions(), syncIssues()]);
    setQueued(queue.length);
    setIssues(failures);
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const catalog = await loadItems();
      setItems(catalog);
      setMessage(`Catalog ready: ${catalog.length} items.`);
      // Warm the asset index so known asset labels remain scannable offline.
      const serialized = catalog.filter((item) => item.trackingMode === 'serialized');
      for (let offset = 0; offset < serialized.length; offset += 4) {
        await Promise.allSettled(serialized.slice(offset, offset + 4).map((item) => loadAssets(item.id)));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not refresh catalog.');
    } finally { setBusy(false); }
  }, []);

  const synchronize = useCallback(async () => {
    try {
      await flush();
      await counts();
      setMessage('Sync complete.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sync will retry when connected.');
    }
  }, [counts]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const saved = await restoreSession();
        if (saved?.user?.id) setAccountScope(saved.user.id);
        const catalog = saved?.user?.id ? await cachedItems() : [];
        if (!mounted) return;
        setSession(saved);
        setItems(catalog);
        if (saved?.user?.id) await counts();
        if (saved?.user?.id) {
          void refresh();
          void synchronize();
        }
        const configurationError = checkConfig();
        if (configurationError) setMessage(configurationError);
      } catch (error) {
        if (mounted) setMessage(error instanceof Error ? error.message : 'Local storage could not be opened.');
      } finally { if (mounted) setReady(true); }
    })();
    return () => { mounted = false; };
  }, [counts, refresh, synchronize]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(connected);
      if (connected && session) void synchronize();
    });
    const app = AppState.addEventListener('change', (status) => {
      if (status === 'active' && session) void synchronize();
    });
    return () => { unsubscribe(); app.remove(); };
  }, [session, synchronize]);

  const login = useCallback(async () => {
    setBusy(true);
    try {
      const next = await signIn();
      if (!next.user?.id) throw new Error('Sign-in did not return an inventory user.');
      setAccountScope(next.user.id);
      setSession(next);
      await counts();
      void refresh();
    } finally { setBusy(false); }
  }, [refresh, counts]);

  const logout = useCallback(async () => {
    await signOut();
    setAccountScope('');
    setSession(null);
    setItems([]);
    setQueued(0);
    setIssues([]);
    // Pending actions remain on this device until the same account reconnects.
  }, []);

  const transact = useCallback(async (input: TransactionInput) => {
    const outcome = await submit(input);
    await counts();
    setMessage(outcome === 'queued' ? 'Saved on this device. It will sync when connected.' : 'Stock updated.');
    if (outcome === 'applied') void refresh();
    return outcome;
  }, [counts, refresh]);

  const assets = useCallback((itemId: string) => loadAssets(itemId), []);

  const resolve = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!code) return null;
    const assetUrl = code.match(/\/items\/([0-9a-f-]{36})\/assets\/([0-9a-f-]{36})/i);
    if (assetUrl) return { itemId: assetUrl[1], assetId: assetUrl[2] };
    const itemUrl = code.match(/\/items\/([0-9a-f-]{36})/i);
    if (itemUrl) return { itemId: itemUrl[1] };
    const local = items.find((item) => [item.id, item.sku, item.barcode].some((value) => value?.toLowerCase() === code.toLowerCase()));
    if (local) return { itemId: local.id };
    for (const item of items.filter((entry) => entry.trackingMode === 'serialized')) {
      const match = (await cachedAssets(item.id)).find((asset) => asset.assetCode.toLowerCase() === code.toLowerCase() || asset.id === code);
      if (match) return { itemId: item.id, assetId: match.id };
    }
    if (uuid.test(code) && items.some((item) => item.id === code)) return { itemId: code };
    try {
      const result = await request<{ targetType: string; targetId: string }>(`/api/inventory-codes/resolve/${encodeURIComponent(code)}`);
      if (result.targetType === 'product') return { itemId: result.targetId };
      if (result.targetType === 'asset') {
        const asset = await request<Asset>(`/api/assets/by-code/${encodeURIComponent(code)}`);
        return { itemId: asset.itemId, assetId: asset.id };
      }
    } catch (error) { if (error instanceof ApiError && error.status !== 404) throw error; }
    try {
      const asset = await request<Asset>(`/api/assets/by-code/${encodeURIComponent(code)}`);
      return { itemId: asset.itemId, assetId: asset.id };
    } catch (error) { if (error instanceof ApiError && error.status !== 404) throw error; }
    return null;
  }, [items]);

  const discard = useCallback(async (id: string) => { await discardIssue(id); await counts(); }, [counts]);

  return <InventoryContext.Provider value={{ ready, session, items, online, queued, issues, busy, message, login, logout, refresh, synchronize, transact, assets, resolve, discard }}>{children}</InventoryContext.Provider>;
}
