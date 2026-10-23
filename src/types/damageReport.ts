import type { ActorSummary } from './user';

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
    reportedBy?: ActorSummary;
    handledBy?: ActorSummary;
  };
}

export type DamageSeverity = 'low' | 'medium' | 'high' | 'critical' | 'total_loss';

/** Mirrors the backend DamageStatus enum. */
export type DamageStatus = 'reported' | 'triaged' | 'awaiting_repair' | 'in_review' | 'in_repair' | 'repaired' | 'verified' | 'returned_to_service' | 'written_off' | 'resolved';
/** Reports with damage still awaiting repair or write-off. */
export const OPEN_DAMAGE_STATUSES: readonly DamageStatus[] = ['reported', 'triaged', 'awaiting_repair', 'in_review', 'in_repair'];
export const CLOSED_DAMAGE_STATUSES: readonly DamageStatus[] = ['repaired', 'verified', 'returned_to_service', 'written_off', 'resolved'];

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
