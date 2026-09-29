import type { Item } from '../types';

export const CSV_OPERATIONS = {
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
