import type { User } from './user';

export interface DamageStatusHistoryEntry {
  status: DamageStatus;
  userId: string;
  timestamp: string;
  amount?: number;
}

export interface DamageReport {
  orderId?: string;
  id: string;
  itemId?: string;
  itemName?: string;
  assemblyId?: string;
  assemblyName?: string;
  assetInstanceId?: string;
  assetCode?: string;
  amount: number;
  repairedAmount?: number;
  writtenOffAmount?: number;
  reportedBy: string;
  handledBy?: string;
  handledAt?: string;
  resolutionNotes?: string;
  statusHistory?: DamageStatusHistoryEntry[];
  description: string;
  severity: DamageSeverity;
  status: DamageStatus;
  timestamp: string;
  created: string;
  updated: string;
  expand?: {
    reportedBy?: User;
    handledBy?: User;
  };
}

export type DamageSeverity = 'low' | 'medium' | 'high' | 'critical' | 'total_loss';

/** Mirrors the backend DamageStatus enum. */
export type DamageStatus = 'reported' | 'triaged' | 'awaiting_repair' | 'in_review' | 'in_repair' | 'repaired' | 'verified' | 'returned_to_service' | 'written_off' | 'resolved';
/** Damage that still blocks stock: everything before return to service, write-off or resolution. */
export const OPEN_DAMAGE_STATUSES: readonly DamageStatus[] = ['reported', 'triaged', 'awaiting_repair', 'in_review', 'in_repair', 'repaired', 'verified'];

export interface DamageReportFormData {
  occurredAt?: string;
  itemId?: string;
  assemblyId?: string;
  assetInstanceId?: string;
  amount: number;
  description: string;
  severity: DamageSeverity;
}

export interface DamageReportUpdateData {
  description: string;
  severity: DamageSeverity;
}
