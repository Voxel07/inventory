import type { AssetInstance } from '../types';
import { apiRequest, apiFileUrl, fetchMedia, uploadMedia } from './apiClient';

export interface Position { id: string; itemId: string; locationId: string; lotId?: string; quantityOnHand: number; quantityReserved: number; quantityDamaged: number; quantityQuarantined: number; quantityInTransit: number; availableQuantity: number; lastCountedAt?: string }
export interface Lot { id: string; itemId: string; lotNumber: string; supplierLot?: string; manufactureDate?: string; expiryDate?: string; bestBeforeDate?: string; storageRequirements?: string; status: string; notes?: string }
export interface TransferLine { id: string; itemId: string; itemName: string; assetInstanceId?: string; assetCode?: string; lotId?: string; requestedQuantity: number; pickedQuantity: number; receivedQuantity: number; discrepancyQuantity: number; discrepancyNotes?: string }
export interface Transfer { id: string; transferNumber: string; sourceLocationId: string; destinationLocationId: string; status: string; dispatchedAt?: string; receivedAt?: string; notes?: string; lines: TransferLine[] }
export interface CountLine { id: string; itemId: string; itemName: string; assetCode?: string; lotId?: string; locationId?: string; expectedQuantity?: number; countedQuantity?: number; recountedQuantity?: number; approvedQuantity?: number; varianceQuantity?: number; countedById?: string; notes?: string }
export interface Count { id: string; sessionNumber: string; locationId?: string; blindCount: boolean; status: string; notes?: string; approvedById?: string; lines: CountLine[] }
export interface Schedule { id: string; itemId: string; assetInstanceId?: string; maintenanceType: string; intervalType: string; intervalValue: number; nextDueAt?: string; nextDueValue?: number; warningWindow?: number; responsiblePersonId?: string; requiredChecklist?: string; checkoutBlocking: boolean; active: boolean }
export interface Repair { id: string; damageReportId: string; assetInstanceId?: string; status: string; repairOwnerId?: string; vendorId?: string; safetyImpact: boolean; partsAndCostNotes?: string; verificationResult?: string; notes?: string }
export interface Receipt { id: string; receiptNumber: string; purchaseOrderId: string; receivedAt: string; receivingLocationId: string; status: string; notes?: string; lines: { id: string; itemName: string; acceptedQuantity: number; damagedQuantity: number; rejectedQuantity: number; receivingNotes?: string }[] }
export interface VendorDocument { id: string; vendorId: string; purchaseOrderId?: string; goodsReceiptId?: string; documentType: string; originalFilename: string; objectStorageKey: string; documentDate?: string; referenceNumber?: string; totalAmountCents?: number; currency?: string; uploadedAt: string; retentionUntil?: string; notes?: string }
export interface OutboxEvent { id: string; eventType: string; aggregateType: string; aggregateId: string; status: string; attemptCount: number; lastError?: string; occurredAt: string }
export interface SyncAudit { id: string; operationType: string; syncStatus: string; conflictMessage?: string; createdAt: string; userId: string; commandId: string; retryCount: number }
type Query = Record<string, string | number | boolean | undefined>;
const list = <T>(path: string, query: Query = {}) => (page: number, size: number) => apiRequest<T[]>(`/api/${path}`, { query: { ...query, page, size } });
const save = <T>(path: string, data: object, id?: string) => apiRequest<T>(`/api/${path}${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: data });
export const operationsApi = {
  assets: (query: Query = {}) => list<AssetInstance>('inventory-assets', query),
  positions: (query: Query = {}) => list<Position>('inventory-positions', query),
  lots: (query: Query = {}) => list<Lot>('inventory-lots', query),
  saveLot: (data: object, id?: string) => save<Lot>('inventory-lots', data, id),
  transfers: list<Transfer>('transfers'),
  createTransfer: (data: object) => save<Transfer>('transfers', data),
  transferCommand: (id: string, action: 'dispatch' | 'receive' | 'cancel', data: object) => apiRequest<Transfer>(`/api/transfers/${id}/${action}`, { method: 'POST', body: data }),
  counts: list<Count>('inventory-counts'),
  createCount: (data: object) => save<Count>('inventory-counts', data),
  countCommand: (id: string, action: 'start' | 'submit' | 'recount' | 'approve' | 'post' | 'cancel', data: object) => apiRequest<Count>(`/api/inventory-counts/${id}/${action}`, { method: 'POST', body: data }),
  schedules: list<Schedule>('maintenance-schedules'),
  saveSchedule: (data: object, id?: string) => save<Schedule>('maintenance-schedules', data, id),
  retireSchedule: (id: string) => apiRequest<void>(`/api/maintenance-schedules/${id}`, { method: 'DELETE' }),
  repairs: list<Repair>('repairs'),
  createRepair: (data: object) => save<Repair>('repairs', data),
  repairCommand: (id: string, data: object) => save<Repair>(`repairs/${id}/transitions`, data),
  receipts: (purchaseOrderId?: string) => list<Receipt>('goods-receipts', { purchaseOrderId }),
  receive: (data: object) => save<Receipt>('goods-receipts', data),
  documents: (purchaseOrderId?: string) => list<VendorDocument>('vendor-documents', { purchaseOrderId }),
  async attachDocument(file: File, data: object) {
    const stagedObjectKey = await uploadMedia(file);
    return save<VendorDocument>('vendor-documents', { ...data, originalFilename: file.name, stagedObjectKey });
  },
  async downloadDocument(document: VendorDocument) {
    const blob = await fetchMedia(apiFileUrl(document.objectStorageKey)!);
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
