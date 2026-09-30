export type ReportRow = Record<string, string | number | boolean | null>;
export interface OperationalReport { name: string; definition: string; startedAt: string | null; generatedAt: string | null; stale: boolean; total: number; rows: ReportRow[]; monthlyTotals: ReportRow[] }
export interface ReportFilters { itemId?: string; eventId?: string; warehouseId?: string; locationId?: string; search?: string; status?: string; category?: string; from?: string; to?: string }
