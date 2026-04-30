export interface DamageReport {
  id: string;
  itemId: string;
  reportedBy: string;
  description: string;
  severity: DamageSeverity;
  status: DamageStatus;
  timestamp: string;
  created: string;
  updated: string;
}

export type DamageSeverity = 'low' | 'medium' | 'high' | 'critical';

export type DamageStatus = 'reported' | 'in_review' | 'resolved' | 'written_off';

export interface DamageReportFormData {
  itemId: string;
  description: string;
  severity: DamageSeverity;
}
