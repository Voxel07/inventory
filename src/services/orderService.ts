import type { GeneralOrder, GeneralOrderSummary, GeneralOrderFormData } from '../types';
import { createMutableResourceApi } from './resourceFactory';
import { apiPage, apiRequest } from './apiClient';
import type { Page } from './apiPagination';
import type { GeneralOrderCommands } from '../types/order';
import { changeOrderStatus, orderPath, prepareOrder, reconcileOrder } from './orderCommands';

const mutations = createMutableResourceApi<GeneralOrder, GeneralOrderFormData>(orderPath('general'), 'general-orders', { cacheDetails: true });
const getPage = (query: { status?: readonly string[]; eventId?: string; eventType?: string; search?: string } | undefined, page: number, size = 100): Promise<Page<GeneralOrderSummary>> =>
  apiPage<GeneralOrderSummary>(orderPath('general'), page, size, { query });
export const generalOrderApi = {
  ...mutations,
  getPage,
};
export function createOrder(data: GeneralOrderFormData) {
  const idempotencyKey = crypto.randomUUID();
  return apiRequest<GeneralOrder>(orderPath('general'), { method: 'POST', body: { ...data, idempotencyKey },
    offline: { type: 'order.create', payload: { kind: 'general', ...data }, idempotencyKey } });
}
export function transitionOrder(id: string, action: 'submit' | 'ready' | 'pickup' | 'close' | 'cancel') {
  const statuses = { submit: 'submitted', ready: 'ready', pickup: 'picked_up', close: 'closed', cancel: 'cancelled' } as const;
  return changeOrderStatus<GeneralOrder>('general', id, statuses[action]);
}
/** Serialized lines also need the returned asset IDs: the backend reconciles them one asset at a time. */
export function returnOrder(id: string, returnedQuantities: Record<string, number>, returnedAssetIds: string[] = []) {
  return reconcileOrder<GeneralOrder>('general', id, { lines: Object.fromEntries(Object.entries(returnedQuantities).map(([itemId, returned]) => [itemId, {
    returned, damaged: 0, missing: 0, writtenOff: 0,
  }])), assets: Object.fromEntries(returnedAssetIds.map((assetId) => [assetId, { outcome: 'returned_good' as const }])) });
}

export function generalOrderCommand(id: string, action: 'prepare', data: GeneralOrderCommands['prepare']): Promise<GeneralOrder>;
export function generalOrderCommand(id: string, action: 'return', data: GeneralOrderCommands['return']): Promise<GeneralOrder>;
export function generalOrderCommand(id: string, action: 'pickup', data: GeneralOrderCommands['pickup']): Promise<GeneralOrder>;
export function generalOrderCommand(id: string, action: keyof GeneralOrderCommands, data: GeneralOrderCommands[keyof GeneralOrderCommands]): Promise<GeneralOrder> {
  if (action === 'prepare' && 'preparedQuantities' in data) return prepareOrder('general', id, data);
  if (action === 'return' && 'lines' in data) return reconcileOrder('general', id, data);
  return changeOrderStatus('general', id, 'picked_up', data);
}
