import { createItemLookup } from '../utils/csv/reference';
import { csvDate } from '../utils/csv/eventLogistics';
import { optionalNumber } from '../utils/inputValues';
import { calendarDate } from '../utils/dateFormat';
import { assertAuthSession, captureAuthSession } from './authManager';
import { normalizeLocationRef } from '../utils/csv/locations';
import { apiRequest } from './apiClient';
import { loadAllPages } from './apiPagination';
import { optionalText, inputNumber } from '../utils/inputValues';
import { equipmentProfileInput, equipmentCommitmentInput } from './equipmentInputs';
import { lotCreateInput, scheduleInput, receiptInput, transferInput, countInput, repairInput, repairTransitionInput } from './operationsInputs';
import { loanApi } from './loanService';
import { memberApi } from './memberService';
import { inputChoice, inputText } from '../utils/inputValues';
import { operationsApi } from './operationsService';
import type { Transfer } from '../types/operations';
import { equipmentApi } from './equipmentService';
import { createPurchaseOrder, createVendor, getPurchaseOrders, getVendors, transitionPurchaseOrder } from './procurementService';
import type { DamageReport, EventReport, Item, StockTransaction } from '../types';
import type { ParsedOperationRow } from '../utils/csvOperations';
import { translate } from '../utils/naming';
import { csvCommandId } from './csvImportIdentity';

export function createCsvOperationImporter(items: Item[], locations: Map<string, string>, events: EventReport[]) {
  const context = captureAuthSession();
  const outputs = new Map<string, string>();
  const itemLookup = createItemLookup(items);
  const today = new Date();
  const date = (offset: number, timestamp: boolean) => {
    const value = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12);
    return timestamp ? value.getTime() : calendarDate(value);
  };
  function resolve(value: unknown, field?: string): unknown {
    if (Array.isArray(value)) return value.map(entry => resolve(entry));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolve(entry, key)]));
    if (field && /(?:Date$|availableFrom$|availableUntil$|returnDue$)/.test(field) && typeof value === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(value)) {
      const parsed = csvDate(value);
      if (!Number.isFinite(parsed)) throw new Error('Invalid DD-MM-YYYY date');
      return parsed;
    }
    if (typeof value !== 'string' || !value.startsWith('@')) return value;
    let result: string | number | undefined;
    if (value.startsWith('@item:')) result = itemLookup.get(value.slice(6).toLowerCase().trim())?.id;
    else if (value.startsWith('@location:')) result = locations.get(normalizeLocationRef(value.slice(10)));
    else if (value.startsWith('@event:')) {
      const [type, start] = value.slice(7).split(':');
      result = events.find((event) => event.eventType === type && event.startDate === csvDate(start))?.id;
    } else if (value.startsWith('@row:')) result = outputs.get(value.slice(5));
    else if (/^@(date|datetime):[+-]?\d+$/.test(value)) result = date(Number(value.split(':')[1]), value.startsWith('@datetime:'));
    else return value;
    if (!result) throw new Error(translate('services.csvOperationImport.referenceCouldNotBeResolvedValue', { value: value }));
    return result;
  }

  // Lookup collections load once per import run; rows that create or change an entry update the loaded copy.
  const loaded = new Map<string, Promise<{ id: string }[]>>();
  function collection<T extends { id: string }>(name: string, load: () => Promise<T[]>): Promise<T[]> {
    let entry = loaded.get(name);
    if (!entry) {
      entry = load();
      loaded.set(name, entry);
      entry.catch(() => loaded.delete(name));
    }
    return entry as Promise<T[]>;
  }
  async function remember<T extends { id: string }>(name: string, value: T): Promise<T> {
    const entry = loaded.get(name);
    if (entry) {
      const list = await entry;
      const index = list.findIndex((candidate) => candidate.id === value.id);
      if (index >= 0) list[index] = value; else list.push(value);
    }
    return value;
  }

  return async (row: ParsedOperationRow): Promise<void> => {
    assertAuthSession(context);
    const data = resolve(row.data) as Record<string, unknown>;
    const key = await csvCommandId(row.name);
    assertAuthSession(context);
    const itemId = String(data.itemId ?? '');
    let result: { id: string };
    switch (row.operation) {
      case 'stock': {
        result = await apiRequest<StockTransaction>('/api/transactions', { method: 'POST', body: {
          itemId, transactionType: inputChoice(data.transactionType, ['adjusted', 'checkout', 'checkin']),
          quantityChanged: inputNumber(data.quantityChanged), reason: inputText(data.reason), notes: optionalText(data.notes),
          assetInstanceId: optionalText(data.assetInstanceId), locationId: optionalText(data.locationId), lotId: optionalText(data.lotId),
          eventType: optionalText(data.eventType), eventOccurrenceId: optionalText(data.eventOccurrenceId), faction: optionalText(data.faction),
          occurredAt: optionalNumber(data.occurredAt), idempotencyKey: key,
        } });
        break;
      }
      case 'damage': {
        result = await apiRequest<DamageReport>('/api/damage-reports', { method: 'POST', body: {
          itemId, amount: inputNumber(data.amount), description: inputText(data.description),
          severity: inputChoice(data.severity, ['low', 'medium', 'high', 'critical', 'total_loss']),
          assetInstanceId: optionalText(data.assetInstanceId), safetyImpact: data.safetyImpact === true,
          occurredAt: optionalNumber(data.occurredAt), idempotencyKey: key,
        } });
        break;
      }
      case 'repair': {
        result = await remember('repairs', await operationsApi.createRepair(repairInput(data)));
        break;
      }
      case 'repair_transition': {
        const repair = (await collection('repairs', () => loadAllPages(operationsApi.repairs))).find((entry) => entry.id === data.repairId);
        if (!repair) throw new Error(translate('services.csvOperationImport.repairCaseNotFound'));
        // Re-imports resume the workflow without replaying completed transitions.
        const stages = ['reported', 'triaged', 'awaiting_repair', 'in_repair', 'repaired', 'verified', 'returned_to_service'];
        const target = String(data.status);
        const completed = repair.status === target
          || (stages.includes(target) && stages.indexOf(repair.status) > stages.indexOf(target))
          || (repair.status === 'written_off' && ['triaged', 'awaiting_repair', 'in_repair'].includes(target));
        result = completed ? repair : await remember('repairs', await operationsApi.repairCommand(repair.id, repairTransitionInput({ ...data, idempotencyKey: key })));
        break;
      }
      case 'lot': {
        const existing = (await collection(`lots:${itemId}`, () => loadAllPages(operationsApi.lots({ itemId })))).find((lot) => lot.lotNumber === data.lotNumber);
        result = existing ?? await remember(`lots:${itemId}`, await operationsApi.createLot(lotCreateInput(data)));
        break;
      }
      case 'maintenance': {
        const existing = (await collection('schedules', () => loadAllPages(operationsApi.schedules()))).find((schedule) => schedule.itemId === itemId
          && (schedule.assetInstanceId ?? null) === (data.assetInstanceId ?? null) && schedule.maintenanceType === data.maintenanceType && schedule.intervalType === data.intervalType);
        result = existing ?? await remember('schedules', await operationsApi.saveSchedule(scheduleInput(data)));
        break;
      }
      case 'purchase': {
        const vendorName = String(data.vendorName);
        const vendor = (await collection('vendors', () => loadAllPages(getVendors))).find((entry) => entry.name === vendorName)
          ?? await remember('vendors', await createVendor(vendorName));
        let order = (await collection('purchase-orders', () => loadAllPages(getPurchaseOrders))).find((entry) => entry.orderNumber === data.orderNumber);
        if (!order) order = await createPurchaseOrder({ ...data, vendorId: vendor.id } as Parameters<typeof createPurchaseOrder>[0]);
        if (data.status === 'ordered' && order.status === 'draft') order = await transitionPurchaseOrder(order.id, 'ordered');
        result = await remember('purchase-orders', order);
        break;
      }
      case 'equipment': {
        const profile = await equipmentApi.get(itemId);
        if (Object.entries(data).some(([field, value]) => !['itemId', 'reason', 'revision'].includes(field) && profile[field as keyof typeof profile] !== value)) {
          await equipmentApi.update(itemId,equipmentProfileInput({ ...data, revision: profile.revision }));
        }
        result = { id: itemId };
        break;
      }
      case 'receipt': {
        const order = (await collection('purchase-orders', () => loadAllPages(getPurchaseOrders))).find((entry) => entry.id === data.purchaseOrderId);
        if (!order) throw new Error(translate('services.csvOperationImport.purchaseOrderNotFound'));
        if (!Array.isArray(data.lines)) throw new Error(translate('services.csvOperationImport.receiptLinesAreMissing'));
        const lines = data.lines.map((value: unknown) => {
          if (!value || typeof value !== 'object') throw new Error(translate('services.csvOperationImport.invalidReceiptLine'));
          const line = value as Record<string, unknown>;
          const purchaseLine = order.lines.find((entry) => entry.itemId === line.itemId);
          if (!purchaseLine) throw new Error(translate('services.csvOperationImport.receivedItemIsMissingFromThePurchaseOrder'));
          return { damagedQuantity: 0, rejectedQuantity: 0, ...line, purchaseOrderLineId: purchaseLine.id };
        });
        result = await operationsApi.receive(receiptInput({ ...data, lines, idempotencyKey: key }));
        break;
      }
      case 'commitment': {
        const profile = await equipmentApi.get(itemId);
        let commitment = profile.commitments.find((entry) => entry.status !== 'cancelled' && entry.availableFrom === data.availableFrom
          && entry.availableUntil === data.availableUntil && entry.quantity === data.quantity && (entry.eventId ?? null) === (data.eventId ?? null));
        if (!commitment) {
          const updated = await equipmentApi.commit(itemId,equipmentCommitmentInput({ ...data, revision: profile.revision }));
          commitment = updated.commitments.find((entry) => !profile.commitments.some((prior) => prior.id === entry.id));
        }
        if (!commitment) throw new Error(translate('services.csvOperationImport.theCommitmentCouldNotBeFound'));
        result = commitment;
        break;
      }
      case 'loan': {
        result = (await loanApi.find((loan) => loan.commitmentId === data.commitmentId))
          ?? await loanApi.create({ commitmentId: inputText(data.commitmentId), providerLocationId: inputText(data.providerLocationId), kind: inputChoice(data.kind, ['borrow', 'rental']), provider: inputText(data.provider), contact: inputText(data.contact), terms: inputText(data.terms) });
        break;
      }
      case 'loan_collect': {
        const loan = (await loanApi.find((entry) => entry.id === data.loanId));
        if (!loan) throw new Error(translate('services.csvOperationImport.loanAgreementNotFound'));
        result = loan.collected >= loan.quantity ? loan : await loanApi.move(loan.id, 'collect', { transferId: inputText(data.transferId), notes: inputText(data.notes), revision: loan.revision });
        break;
      }
      case 'transfer': {
        let transfer: Transfer = await operationsApi.createTransfer(transferInput({ ...data, idempotencyKey: key }));
        if (data.status === 'received') {
          if (['requested', 'picking'].includes(transfer.status)) transfer = await operationsApi.transferCommand(transfer.id, 'dispatch', { idempotencyKey: await csvCommandId(`${row.name}:dispatch`), notes: optionalText(data.notes) });
          if (transfer.status === 'in_transit') transfer = await operationsApi.transferCommand(transfer.id, 'receive', {
            idempotencyKey: await csvCommandId(`${row.name}:receive`), notes: optionalText(data.notes),
            lines: transfer.lines.map((line) => ({ transferLineId: line.id, receivedQuantity: line.pickedQuantity, discrepancyQuantity: 0 })),
          });
        }
        result = transfer;
        break;
      }
      case 'count': {
        result = (await collection('counts', () => loadAllPages(operationsApi.counts))).find((entry) => entry.sessionNumber === data.sessionNumber)
          ?? await remember('counts', await operationsApi.createCount(countInput(data)));
        break;
      }
      case 'member_request': {
        result = await memberApi.request({ itemId, assetId: optionalText(data.assetId), locationId: optionalText(data.locationId), kind: inputText(data.kind), quantity: inputNumber(data.quantity), notes: inputText(data.notes), commandId: key });
        break;
      }
      case 'member_return': {
        const custody = (await memberApi.custody()).find((entry) => entry.itemId === itemId && entry.checkedOut >= Number(data.quantity));
        if (!custody) throw new Error(translate('services.csvOperationImport.noOwnLoanFoundForThisReturn'));
        result = await memberApi.submitReturn({ quantity: inputNumber(data.quantity), notes: optionalText(data.notes), custodyKey: custody.key, assetId: custody.assetInstanceId, commandId: key });
        break;
      }
    }
    outputs.set(row.name, result.id);
  };
}
