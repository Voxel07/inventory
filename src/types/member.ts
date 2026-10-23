import type { CheckedOutRow } from './custody';
import type { DamageSeverity } from './damageReport';
export type MemberCustody = CheckedOutRow;
export interface MemberStored { itemId: string; name: string; locationId?: string; location?: string; assetId?: string; assetCode?: string; quantity: number }
export interface MemberRequest { id: string; itemId: string; item: string; requester: string; kind: string; quantity: number; notes: string; status: string; response?: string; createdAt: number; revision: number; assetId?: string; locationId?: string; damageReportId?: string }
export interface MemberAssignment { id: string; name: string; userId?: string }
export interface MemberRequestInput { itemId: string; assetId?: string | null; locationId?: string | null; kind: string; quantity: number; notes: string; commandId: string; severity?: DamageSeverity }
export interface MemberReturnInput { custodyKey: string; quantity: number; assetId?: string | null; notes?: string | null; commandId: string }
export interface MemberDecisionInput { revision: number; response: string; resolved: boolean }
