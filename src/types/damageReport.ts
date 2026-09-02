import type { User } from './user';

export interface DamageStatusHistoryEntry {
  status: DamageStatus;
  userId: string;
  timestamp: string;
  amount?: number;
}

export interface DamageReport {
  id: string;
  itemId: string;
  amount: number;
  repairedAmount?: number;
  writtenOffAmount?: number;
  reportedBy: string;
  handledBy?: string;
  handledAt?: string;
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

export type DamageStatus = 'reported' | 'in_review' | 'repaired' | 'written_off' | 'resolved';

export interface DamageReportFormData {
  itemId: string;
  amount: number;
  description: string;
  severity: DamageSeverity;
}
