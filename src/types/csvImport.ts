import { type ItemFormData, type AssemblyFormData, type EventReportFormData, type FactionOrderFormData, type GeneralOrderFormData, type EventType } from './index';
import type { EventAttendeeInput, EventTimelineInput } from './eventLogistics';
import type { LotInput } from './operations';

export type CsvItemLot = LotInput & { quantity: number };

export interface ParsedItemRow {
  index: number;
  data: ItemFormData;
  rawRow: Record<string, string>;
  /** Location as written in the CSV (code, path or name). */
  storageLocationName?: string;
  storageLocationId?: string;
  /** Path to create when the location does not exist yet; existing leading levels are reused. */
  storageLocationPath?: string[];
  assetCodes?: string[];
  lots?: CsvItemLot[];
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
  attendees: EventAttendeeInput[];
  timeline: EventTimelineInput[];
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
  eventDate: number;
  requestedItems: ParsedAssemblyComponent[];
  returnedItems: ParsedAssemblyComponent[];
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
  date?: number;
  generalOrderName?: string;
  notes?: string;
  targetStatus: 'pending' | 'accepted' | 'rejected';
  status: 'valid' | 'error';
  statusMessage?: string;
}

export interface ParsedCheckoutRow {
  itemId?: string;
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
