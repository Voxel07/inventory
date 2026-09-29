import { apiRequest } from './apiClient';
import { operationsApi, type Transfer } from './operationsService';
import { equipmentApi } from './equipmentService';
import { createPurchaseOrder, createVendor, getPurchaseOrders, getVendors, transitionPurchaseOrder } from './procurementService';
import type { EventReport, Item } from '../types';
import type { ParsedOperationRow } from '../utils/csvOperations';

async function allPages<T>(page: (page: number, size: number) => Promise<T[]>): Promise<T[]> {
  const entries: T[] = [];
  for (let index = 0; ; index++) {
    const batch = await page(index, 100);
    entries.push(...batch);
    if (batch.length < 100) return entries;
  }
}

async function commandId(name: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`inventory-csv:${name}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface LoanView { id: string; commitmentId: string; collected: number; quantity: number; revision: number }
interface CustodyRow { key: string; itemId: string; checkedOut: number; pendingQuantity: number; assetInstanceId?: string }

export function createCsvOperationImporter(items: Item[], locations: Map<string, string>, events: EventReport[]) {
  const outputs = new Map<string, string>();
  const today = new Date();
  const date = (offset: number, timestamp: boolean) => {
    const value = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12);
    return timestamp ? value.toISOString() : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  };
  function resolve(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry)]));
    if (typeof value !== 'string' || !value.startsWith('@')) return value;
    let result: string | undefined;
    if (value.startsWith('@item:')) result = items.find((item) => item.name.toLowerCase().trim() === value.slice(6).toLowerCase().trim())?.id;
    else if (value.startsWith('@location:')) result = locations.get(value.slice(10).toLowerCase().trim());
    else if (value.startsWith('@event:')) {
      const [type, start] = value.slice(7).split(':');
      result = events.find((event) => event.eventType === type && event.startDate.slice(0, 10) === start)?.id;
    } else if (value.startsWith('@row:')) result = outputs.get(value.slice(5));
    else if (/^@(date|datetime):[+-]?\d+$/.test(value)) result = date(Number(value.split(':')[1]), value.startsWith('@datetime:'));
    else return value;
    if (!result) throw new Error(`Referenz konnte nicht aufgelöst werden: ${value}`);
    return result;
  }

  return async (row: ParsedOperationRow): Promise<void> => {
    const data = resolve(row.data) as Record<string, unknown>;
    const key = await commandId(row.name);
    const itemId = String(data.itemId ?? '');
    let result: { id: string };
    switch (row.operation) {
      case 'lot': {
        const existing = (await allPages(operationsApi.lots({ itemId }))).find((lot) => lot.lotNumber === data.lotNumber);
        result = existing ?? await operationsApi.saveLot(data);
        break;
      }
      case 'maintenance': {
        const existing = (await allPages(operationsApi.schedules)).find((schedule) => schedule.itemId === itemId
          && (schedule.assetInstanceId ?? null) === (data.assetInstanceId ?? null) && schedule.maintenanceType === data.maintenanceType && schedule.intervalType === data.intervalType);
        result = existing ?? await operationsApi.saveSchedule(data);
        break;
      }
      case 'purchase': {
        const vendorName = String(data.vendorName);
        const vendor = (await allPages(getVendors)).find((entry) => entry.name === vendorName) ?? await createVendor(vendorName);
        let order = (await allPages(getPurchaseOrders)).find((entry) => entry.orderNumber === data.orderNumber);
        if (!order) order = await createPurchaseOrder({ ...data, vendorId: vendor.id } as Parameters<typeof createPurchaseOrder>[0]);
        if (data.status === 'ordered' && order.status === 'draft') order = await transitionPurchaseOrder(order.id, 'ordered');
        result = order;
        break;
      }
      case 'equipment': {
        const profile = await equipmentApi.get(itemId);
        if (Object.entries(data).some(([field, value]) => !['itemId', 'reason', 'revision'].includes(field) && profile[field as keyof typeof profile] !== value)) {
          await equipmentApi.update(itemId, { ...data, revision: profile.revision });
        }
        result = { id: itemId };
        break;
      }
      case 'receipt': {
        const order = (await allPages(getPurchaseOrders)).find((entry) => entry.id === data.purchaseOrderId);
        if (!order) throw new Error('Einkaufsbestellung nicht gefunden');
        if (!Array.isArray(data.lines)) throw new Error('Wareneingangszeilen fehlen');
        const lines = data.lines.map((value: unknown) => {
          if (!value || typeof value !== 'object') throw new Error('Ungültige Wareneingangszeile');
          const line = value as Record<string, unknown>;
          const purchaseLine = order.lines.find((entry) => entry.itemId === line.itemId);
          if (!purchaseLine) throw new Error('Wareneingangsartikel fehlt in der Einkaufsbestellung');
          return { damagedQuantity: 0, rejectedQuantity: 0, ...line, purchaseOrderLineId: purchaseLine.id };
        });
        result = await operationsApi.receive({ ...data, lines, idempotencyKey: key });
        break;
      }
      case 'commitment': {
        const profile = await equipmentApi.get(itemId);
        let commitment = profile.commitments.find((entry) => entry.status !== 'cancelled' && entry.availableFrom === data.availableFrom
          && entry.availableUntil === data.availableUntil && entry.quantity === data.quantity && (entry.eventId ?? null) === (data.eventId ?? null));
        if (!commitment) {
          const updated = await equipmentApi.commit(itemId, { ...data, revision: profile.revision });
          commitment = updated.commitments.find((entry) => !profile.commitments.some((prior) => prior.id === entry.id));
        }
        if (!commitment) throw new Error('Die Zusage konnte nicht gefunden werden');
        result = commitment;
        break;
      }
      case 'loan': {
        result = (await apiRequest<LoanView[]>('/api/loans')).find((loan) => loan.commitmentId === data.commitmentId)
          ?? await apiRequest<LoanView>('/api/loans', { method: 'POST', body: data });
        break;
      }
      case 'loan_collect': {
        const loan = (await apiRequest<LoanView[]>('/api/loans')).find((entry) => entry.id === data.loanId);
        if (!loan) throw new Error('Leihvereinbarung nicht gefunden');
        result = loan.collected >= loan.quantity ? loan : await apiRequest<LoanView>(`/api/loans/${loan.id}/collect`, { method: 'POST', body: { ...data, revision: loan.revision } });
        break;
      }
      case 'transfer': {
        let transfer: Transfer = await operationsApi.createTransfer({ ...data, idempotencyKey: key });
        if (data.status === 'received') {
          if (['requested', 'picking'].includes(transfer.status)) transfer = await operationsApi.transferCommand(transfer.id, 'dispatch', { idempotencyKey: await commandId(`${row.name}:dispatch`), notes: data.notes });
          if (transfer.status === 'in_transit') transfer = await operationsApi.transferCommand(transfer.id, 'receive', {
            idempotencyKey: await commandId(`${row.name}:receive`), notes: data.notes,
            lines: transfer.lines.map((line) => ({ transferLineId: line.id, receivedQuantity: line.pickedQuantity, discrepancyQuantity: 0 })),
          });
        }
        result = transfer;
        break;
      }
      case 'count': {
        result = (await allPages(operationsApi.counts)).find((entry) => entry.sessionNumber === data.sessionNumber) ?? await operationsApi.createCount(data);
        break;
      }
      case 'member_request': {
        result = await apiRequest<{ id: string }>('/api/member/requests', { method: 'POST', body: { ...data, commandId: key } });
        break;
      }
      case 'member_return': {
        const custody = (await apiRequest<CustodyRow[]>('/api/member/custody')).find((entry) => entry.itemId === itemId && entry.checkedOut >= Number(data.quantity));
        if (!custody) throw new Error('Keine eigene Ausleihe für diese Rückgabe gefunden');
        result = await apiRequest<{ id: string }>('/api/member/returns', { method: 'POST', body: { ...data, custodyKey: custody.key, assetId: custody.assetInstanceId, commandId: key } });
        break;
      }
    }
    outputs.set(row.name, result.id);
  };
}
