import type { Item } from '../types';

export const CSV_OPERATIONS = {
  stock: ['Bestandsänderung', 'Stock change', ['itemId', 'transactionType', 'quantityChanged', 'reason']],
  damage: ['Schadensmeldung', 'Damage report', ['itemId', 'amount', 'description', 'severity']],
  repair: ['Reparaturfall', 'Repair case', ['damageReportId']],
  repair_transition: ['Reparaturstatus', 'Repair transition', ['repairId', 'status']],
  lot: ['Charge', 'Lot', ['itemId', 'lotNumber']],
  maintenance: ['Wartungsplan', 'Maintenance schedule', ['itemId', 'maintenanceType', 'intervalType', 'intervalValue']],
  purchase: ['Einkauf', 'Purchase order', ['vendorName', 'orderNumber', 'orderDate', 'lines']],
  receipt: ['Wareneingang', 'Goods receipt', ['purchaseOrderId', 'receivingLocationId', 'lines']],
  equipment: ['Eigentum / Verwahrung', 'Ownership / keeper', ['itemId', 'ownershipType', 'availabilityPolicy', 'reason']],
  commitment: ['Verfügbarkeitszusage', 'Availability commitment', ['itemId', 'quantity', 'availableFrom', 'availableUntil', 'pickupDetails', 'notes']],
  loan: ['Leihe / Miete', 'Borrowing / rental', ['commitmentId', 'providerLocationId', 'kind', 'provider', 'contact', 'terms']],
  loan_collect: ['Anbieter-Abholung', 'Provider collection', ['loanId', 'transferId', 'notes']],
  transfer: ['Umlagerung', 'Transfer', ['sourceLocationId', 'destinationLocationId', 'lines']],
  count: ['Inventur', 'Stock count', ['sessionNumber']],
  member_request: ['Mitgliederanfrage', 'Member request', ['itemId', 'kind', 'quantity', 'notes']],
  member_return: ['Rückgabe zur Bestätigung', 'Return for acknowledgement', ['itemId', 'quantity', 'notes']],
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
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Daten müssen ein JSON-Objekt sein');
      data = parsed as Record<string, unknown>;
      if (!Object.hasOwn(CSV_OPERATIONS, operation)) throw new Error(`Unbekannte Aktion: ${operation}`);
      if (!name || names.has(name)) throw new Error('Ein eindeutiger Name für die Aktion fehlt');
      for (const key of CSV_OPERATIONS[operation][2]) {
        if (data[key] == null || data[key] === '' || (Array.isArray(data[key]) && !data[key].length)) throw new Error(`Pflichtfeld fehlt: ${key}`);
      }
      if (['stock', 'damage', 'repair', 'repair_transition'].includes(operation)) {
        const quantity = operation === 'stock' ? data.quantityChanged : data.amount;
        if (quantity != null && (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1)) {
          throw new Error('Die Menge muss eine positive ganze Zahl sein');
        }
        if (operation === 'stock' && !['adjusted', 'checkout', 'checkin'].includes(String(data.transactionType))) {
          throw new Error('Bestandsänderungen verwenden adjusted, checkout oder checkin; Abschreibungen erfolgen über Reparaturen');
        }
        if (operation === 'stock' && data.transactionType === 'checkout' && (!data.eventType || !data.faction)) {
          throw new Error('Eventtyp und Fraktion sind für Ausleihen erforderlich');
        }
        if (operation === 'damage' && !['low', 'medium', 'high', 'critical', 'total_loss'].includes(String(data.severity))) {
          throw new Error('Ungültiger Schweregrad');
        }
        if (operation === 'repair_transition') {
          if (!['triaged', 'awaiting_repair', 'in_repair', 'repaired', 'verified', 'returned_to_service', 'written_off'].includes(String(data.status))) {
            throw new Error('Ungültiger Reparaturstatus');
          }
          if (['repaired', 'written_off'].includes(String(data.status)) && data.amount == null) throw new Error('Die Reparatur-/Abschreibungsmenge fehlt');
          if (data.status === 'verified' && (typeof data.verificationResult !== 'string' || !data.verificationResult.trim())) throw new Error('Das Prüfergebnis fehlt');
        }
        if (data.occurredAt != null && (typeof data.occurredAt !== 'string'
          || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.occurredAt)
          || !Number.isFinite(Date.parse(data.occurredAt)) || Date.parse(data.occurredAt) > Date.now())) {
          throw new Error('occurredAt muss ein gültiger ISO-Zeitstempel mit Zeitzone in der Vergangenheit sein');
        }
      }
      function check(value: unknown): void {
        if (typeof value === 'string') {
          if (value.startsWith('@row:') && !names.has(value.slice(5))) throw new Error(`Aktion muss vorher stehen: ${value.slice(5)}`);
          if (value.startsWith('@item:') && !itemNames.has(value.slice(6).toLowerCase().trim())) throw new Error(`Unbekannter Artikel: ${value.slice(6)}`);
          if (/^@(date|datetime):/.test(value) && !/^@(date|datetime):[+-]?\d+$/.test(value)) throw new Error(`Ungültiger relativer Termin: ${value}`);
        } else if (Array.isArray(value)) value.forEach(check);
        else if (value && typeof value === 'object') Object.values(value).forEach(check);
      }
      check(data);
      names.add(name);
    } catch (error) { statusMessage = error instanceof Error ? error.message : String(error); }
    return [{ index: i + 1, name, operation, data, description: raw.Beschreibung ?? '', status: statusMessage ? 'error' : 'valid', statusMessage }];
  });
}
