import { createContext, useContext } from 'react';
import type { Asset, Item, Session, SyncIssue, TransactionInput } from './types';

export type InventoryState = {
  ready: boolean;
  session: Session | null;
  items: Item[];
  online: boolean;
  queued: number;
  issues: SyncIssue[];
  busy: boolean;
  message: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  synchronize: () => Promise<void>;
  transact: (input: TransactionInput) => Promise<'applied' | 'queued'>;
  assets: (itemId: string) => Promise<Asset[]>;
  resolve: (code: string) => Promise<{ itemId: string; assetId?: string } | null>;
  discard: (id: string) => Promise<void>;
};

export const InventoryContext = createContext<InventoryState | null>(null);

export function useInventory(): InventoryState {
  const value = useContext(InventoryContext);
  if (!value) throw new Error('InventoryProvider is missing');
  return value;
}
