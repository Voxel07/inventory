import type { Item } from '../types';
import { translate } from './naming';

export const CSV_OPERATIONS = {
  stock: { label: 'utils.csvOperations.operationLabels.stock', requiredFields: ['itemId', 'transactionType', 'quantityChanged', 'reason'] },
  damage: { label: 'utils.csvOperations.operationLabels.damage', requiredFields: ['itemId', 'amount', 'description', 'severity'] },
  repair: { label: 'utils.csvOperations.operationLabels.repair', requiredFields: ['damageReportId'] },
  repair_transition: { label: 'utils.csvOperations.operationLabels.repair_transition', requiredFields: ['repairId', 'status'] },
  lot: { label: 'utils.csvOperations.operationLabels.lot', requiredFields: ['itemId', 'lotNumber'] },
  maintenance: { label: 'utils.csvOperations.operationLabels.maintenance', requiredFields: ['itemId', 'maintenanceType', 'intervalType', 'intervalValue'] },
  purchase: { label: 'utils.csvOperations.operationLabels.purchase', requiredFields: ['vendorName', 'orderNumber', 'orderDate', 'lines'] },
  receipt: { label: 'utils.csvOperations.operationLabels.receipt', requiredFields: ['purchaseOrderId', 'receivingLocationId', 'lines'] },
  equipment: { label: 'utils.csvOperations.operationLabels.equipment', requiredFields: ['itemId', 'ownershipType', 'availabilityPolicy', 'reason'] },
  commitment: { label: 'utils.csvOperations.operationLabels.commitment', requiredFields: ['itemId', 'quantity', 'availableFrom', 'availableUntil', 'pickupDetails', 'notes'] },
  loan: { label: 'utils.csvOperations.operationLabels.loan', requiredFields: ['commitmentId', 'providerLocationId', 'kind', 'provider', 'contact', 'terms'] },
  loan_collect: { label: 'utils.csvOperations.operationLabels.loan_collect', requiredFields: ['loanId', 'transferId', 'notes'] },
  transfer: { label: 'utils.csvOperations.operationLabels.transfer', requiredFields: ['sourceLocationId', 'destinationLocationId', 'lines'] },
  count: { label: 'utils.csvOperations.operationLabels.count', requiredFields: ['sessionNumber'] },
  member_request: { label: 'utils.csvOperations.operationLabels.member_request', requiredFields: ['itemId', 'kind', 'quantity', 'notes'] },
  member_return: { label: 'utils.csvOperations.operationLabels.member_return', requiredFields: ['itemId', 'quantity', 'notes'] },
} as const;

export type CsvOperation = keyof typeof CSV_OPERATIONS;
export interface ParsedOperationRow {
  index: number;
  name: string;
  operation: CsvOperation;
  data: Record<string, unknown>;
  description: string;
  status: 'valid' | 'error';
  statusMessage?: string;
}

/** Operations use explicit commands; named references avoid database IDs in sample files. */
export function parseOperationsFromCsv(rows: Record<string, string>[], items: Item[]): ParsedOperationRow[] {
  const names = new Set<string>();
  const itemNames = new Set(items.map((item) => item.name.toLowerCase().trim()));
  return rows.flatMap((raw, i) => {
    if (!['operation', 'aktion'].includes((raw.Typ ?? raw.Type ?? '').toLowerCase().trim())) return [];
    const name = (raw.Name ?? '').trim();
    const operation = (raw.Aktion ?? raw.Operation ?? '').trim() as CsvOperation;
    let data: Record<string, unknown> = {};
    let statusMessage: string | undefined;
    try {
      const parsed: unknown = JSON.parse(raw.Daten ?? raw.Data ?? '');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(translate('utils.csvOperations.dataMustBeAJSONObject'));
      data = parsed as Record<string, unknown>;
      if (!Object.hasOwn(CSV_OPERATIONS, operation)) throw new Error(translate('utils.csvOperations.unknownActionOperation', { operation: operation }));
      if (!name || names.has(name)) throw new Error(translate('utils.csvOperations.aUniqueNameForTheActionIsMissing'));
      for (const key of CSV_OPERATIONS[operation].requiredFields) {
        if (data[key] == null || data[key] === '' || (Array.isArray(data[key]) && !data[key].length)) throw new Error(translate('utils.csvOperations.requiredFieldMissingKey', { key: key }));
      }
      if (['stock', 'damage', 'repair', 'repair_transition'].includes(operation)) {
        const quantity = operation === 'stock' ? data.quantityChanged : data.amount;
        if (quantity != null && (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1)) {
          throw new Error(translate('utils.csvOperations.theQuantityMustBeAPositiveWholeNumber'));
        }
        if (operation === 'stock' && !['adjusted', 'checkout', 'checkin'].includes(String(data.transactionType))) {
          throw new Error(translate('utils.csvOperations.stockChangesUseAdjustedCheckoutOrCheckinWriteOffsAre'));
        }
        if (operation === 'stock' && data.transactionType === 'checkout' && (data.eventType || data.eventOccurrenceId) && !data.faction) {
          throw new Error(translate('utils.csvOperations.eventCheckoutsRequireAFaction'));
        }
        if (operation === 'damage' && !['low', 'medium', 'high', 'critical', 'total_loss'].includes(String(data.severity))) {
          throw new Error(translate('utils.csvOperations.invalidSeverity'));
        }
        if (operation === 'repair_transition') {
          if (!['triaged', 'awaiting_repair', 'in_repair', 'repaired', 'verified', 'returned_to_service', 'written_off'].includes(String(data.status))) {
            throw new Error(translate('utils.csvOperations.invalidRepairStatus'));
          }
          if (['repaired', 'written_off'].includes(String(data.status)) && data.amount == null) throw new Error(translate('utils.csvOperations.theRepairWriteOffQuantityIsMissing'));
          if (data.status === 'verified' && (typeof data.verificationResult !== 'string' || !data.verificationResult.trim())) throw new Error(translate('utils.csvOperations.theInspectionResultIsMissing'));
        }
        if (data.occurredAt != null && (typeof data.occurredAt !== 'number' || !Number.isSafeInteger(data.occurredAt)
          || !Number.isFinite(data.occurredAt) || data.occurredAt > Date.now())) {
          throw new Error(translate('utils.csvOperations.occurredAtMustBeEpochMillisecondsInThePast'));
        }
      }
      function check(value: unknown): void {
        if (typeof value === 'string') {
          if (value.startsWith('@row:') && !names.has(value.slice(5))) throw new Error(translate('utils.csvOperations.actionMustComeFirstValue', { value: String(value.slice(5)) }));
          if (value.startsWith('@item:') && !itemNames.has(value.slice(6).toLowerCase().trim())) throw new Error(translate('utils.csvOperations.unknownItemValue', { value: String(value.slice(6)) }));
          if (/^@(date|datetime):/.test(value) && !/^@(date|datetime):[+-]?\d+$/.test(value)) throw new Error(translate('utils.csvOperations.invalidRelativeDateValue', { value: value }));
        } else if (Array.isArray(value)) value.forEach(check);
        else if (value && typeof value === 'object') Object.values(value).forEach(check);
      }
      check(data);
      names.add(name);
    } catch (error) { statusMessage = error instanceof Error ? error.message : String(error); }
    return [{ index: i + 1, name, operation, data, description: raw.Beschreibung ?? '', status: statusMessage ? 'error' : 'valid', statusMessage }];
  });
}
