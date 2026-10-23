export type ReportRow = Record<string, string | number | boolean | null>;
export interface ReportJob { state: 'idle' | 'pending' | 'running' | 'retry' | 'completed' | 'failed'; attempts: number; requestedAt: number | null; error: string | null }
export interface OperationalReport { name: string; definition: string; startedAt: number | null; generatedAt: number | null; stale: boolean; total: number; rows: ReportRow[]; monthlyTotals: ReportRow[]; job: ReportJob }
export interface ReportFilters { itemId?: string; eventId?: string; siteId?: string; locationId?: string; search?: string; status?: string; category?: string; from?: number; to?: number }
