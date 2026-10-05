import { type ItemFormData, type AssemblyFormData, type EventReportFormData, type FactionOrderFormData, type GeneralOrderFormData, type EventType } from './index';

export interface ParsedItemRow {
  index: number;
  data: ItemFormData;
  rawRow: Record<string, string>;
  storageLocationName?: string;
  storageLocationId?: string;
  assetCodes?: string[];
  status: 'valid' | 'warning' | 'error' | 'duplicate';
  statusMessage?: string;
  isExisting: boolean;
  existingId?: string;
}

export interface ParsedAssemblyComponent {
  itemName: string;
  quantity: number;
  itemId?: string;
  matched: boolean;
}

export interface ParsedAssemblyRow {
  index: number;
  data: AssemblyFormData;
  rawRow: Record<string, string>;
  components: ParsedAssemblyComponent[];
  status: 'valid' | 'warning' | 'error' | 'duplicate';
  statusMessage?: string;
  isExisting: boolean;
  existingId?: string;
}

export interface ParsedEventReportRow {
  index: number;
  data: EventReportFormData;
  rawRow: Record<string, string>;
  plannedItems: ParsedAssemblyComponent[];
  usedItems: ParsedAssemblyComponent[];
  status: 'valid' | 'error';
  statusMessage?: string;
}

export type FactionOrderImportStatus =
  | 'draft'
  | 'submitted'
  | 'ready'
  | 'picked_up'
  | 'returned'
  | 'closed'
  | 'partially_returned';

export interface ParsedFactionOrderRow {
  index: number;
  data: FactionOrderFormData;
  rawRow: Record<string, string>;
  requestedItems: ParsedAssemblyComponent[];
  returnedItems?: ParsedAssemblyComponent[];
  /** Exact pickup point; the ready transition requires one. */
  pickupPoint?: { latitude: number; longitude: number };
  targetStatus: FactionOrderImportStatus;
  status: 'valid' | 'error';
  statusMessage?: string;
}

export interface ParsedGeneralOrderRow {
  index: number;
  rawRow: Record<string, string>;
  data: GeneralOrderFormData;
  eventType?: EventType;
  eventDate: string;
  requestedItems: ParsedAssemblyComponent[];
  returnedItems: ParsedAssemblyComponent[];
  consumedItems: ParsedAssemblyComponent[];
  targetStatus: FactionOrderImportStatus;
  status: 'valid' | 'error';
  statusMessage?: string;
}

export interface ParsedReturnRow {
  index: number;
  rawRow: Record<string, string>;
  itemName: string;
  itemId?: string;
  quantity: number;
  assetCode?: string;
  assetCodes: string[];
  storageLocationName?: string;
  storageLocationId?: string;
  eventType?: EventType;
  faction?: string;
  person?: string;
  date?: string;
  generalOrderName?: string;
  notes?: string;
  targetStatus: 'pending' | 'accepted' | 'rejected';
  status: 'valid' | 'error';
  statusMessage?: string;
}

export interface ParsedCheckoutRow {
  index: number;
  itemName: string;
  quantity: number;
  assetCodes: string[];
  eventType?: EventType;
  faction?: string;
  notes: string;
  status: 'valid' | 'error';
  statusMessage?: string;
}

export type CsvImportType = 'items' | 'assemblies' | 'combined';

export interface CsvImportCounts {
  items: number;
  assemblies: number;
  events: number;
  orders: number;
  generalOrders: number;
  returns: number;
  checkouts: number;
  operations: number;
}

export const EMPTY_CSV_IMPORT_COUNTS: CsvImportCounts = {
  items: 0, assemblies: 0, events: 0, orders: 0, generalOrders: 0,
  returns: 0, checkouts: 0, operations: 0,
};
