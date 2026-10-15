import type { AssetInstance } from '../types';
import { apiPage, apiRequest, apiFileUrl, fetchMedia, uploadMedia, type ApiQuery } from './apiClient';
import { assertAuthSession, captureAuthSession } from './authManager';

import type { Position, Lot, Transfer, Count, Schedule, Repair, Receipt, VendorDocument, OutboxEvent, SyncAudit, LotCreateInput, LotUpdateInput, TransferInput, TransferCommands, CountInput, CountCommands, ScheduleInput, RepairInput, RepairTransitionInput, ReceiptInput, VendorDocumentInput } from '../types/operations';

const list = <T>(path: string, query: ApiQuery = {}) => (page: number, size: number) => apiPage<T>(`/api/${path}`, page, size, { query });
const save = <T>(path: string, data: unknown, id?: string) => apiRequest<T>(`/api/${path}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: data });
export const operationsApi = {
  assets: (query: ApiQuery = {}) => list<AssetInstance>('inventory-assets', query),
  positions: (query: ApiQuery = {}) => list<Position>('inventory-positions', query),
  lots: (query: ApiQuery = {}) => list<Lot>('inventory-lots', query),
  createLot: (data: LotCreateInput) => save<Lot>('inventory-lots', data),
  updateLot: (id: string, data: LotUpdateInput) => save<Lot>('inventory-lots', data, id),
  transfers: list<Transfer>('transfers'),
  createTransfer: (data: TransferInput) => save<Transfer>('transfers', data),
  transferCommand: <A extends keyof TransferCommands>(id: string, action: A, data: TransferCommands[A]) => apiRequest<Transfer>(`/api/transfers/${id}/${action}`, { method: 'POST', body: data }),
  counts: list<Count>('inventory-counts'),
  createCount: (data: CountInput) => save<Count>('inventory-counts', data),
  countCommand: <A extends keyof CountCommands>(id: string, action: A, data: CountCommands[A]) => apiRequest<Count>(`/api/inventory-counts/${id}/${action}`, { method: 'POST', body: data }),
  schedules: (query: ApiQuery = {}) => list<Schedule>('maintenance-schedules', query),
  saveSchedule: (data: ScheduleInput, id?: string) => save<Schedule>('maintenance-schedules', data, id),
  retireSchedule: (id: string) => apiRequest<void>(`/api/maintenance-schedules/${id}`, { method: 'DELETE' }),
  repairs: list<Repair>('repairs'),
  createRepair: (data: RepairInput) => save<Repair>('repairs', data),
  repairCommand: (id: string, data: RepairTransitionInput) => save<Repair>(`repairs/${id}/transitions`, data),
  receipts: (purchaseOrderId?: string) => list<Receipt>('goods-receipts', { purchaseOrderId }),
  receive: (data: ReceiptInput) => save<Receipt>('goods-receipts', data),
  documents: (purchaseOrderId?: string) => list<VendorDocument>('vendor-documents', { purchaseOrderId }),
  async attachDocument(file: File, data: VendorDocumentInput) {
    const context = captureAuthSession();
    const stagedObjectKey = await uploadMedia(file, context);
    return apiRequest<VendorDocument>('/api/vendor-documents', { method: 'POST', body: { ...data, originalFilename: file.name, stagedObjectKey }, session: context });
  },
  async downloadDocument(document: VendorDocument) {
    const context = captureAuthSession();
    const blob = await fetchMedia(apiFileUrl(document.objectStorageKey)!);
    assertAuthSession(context);
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url; link.download = document.originalFilename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  outboxStatus: () => apiRequest<{ counts: Record<string, number> }>('/api/outbox/status'),
  deadLetters: list<OutboxEvent>('outbox/dead-letters'),
  retryEvent: (id: string) => save<OutboxEvent>(`outbox/dead-letters/${id}/retry`, {}),
  syncAudit: list<SyncAudit>('sync/audit'),
};
