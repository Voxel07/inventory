import { apiRequest } from './apiClient';
import type { buildCsvImportPlan } from '../utils/csv/importPlan';
import type { CsvImportCounts, CsvImportType } from '../types/csvImport';

export interface CsvImportResult {
  successItems: number; updatedItems: number; successAssemblies: number; successEvents: number;
  successOrders: number; successGeneralOrders: number; successReturns: number; successCheckouts: number;
  successOperations: number; errors: string[];
}
export interface CsvImportJob {
  id: string; filename: string; status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number; totalRows: number; processedRows: number; result: CsvImportResult;
  createdAt: number; updatedAt: number;
}
type Preview = ReturnType<typeof buildCsvImportPlan>;
export type CsvImportUploadPlan = Pick<Preview, 'newFactions' | 'parsedItems' | 'parsedAssemblies' | 'parsedEvents'
  | 'parsedOrders' | 'parsedGeneralOrders' | 'parsedReturns' | 'parsedCheckouts' | 'parsedOperations'> & {
  tabType: CsvImportType; updateExistingItems: boolean; autoCreateLocations: boolean;
};

/** Only the upload belongs to the browser. The worker executes the persisted plan independently. */
export function uploadCsvImport(filename: string, plan: CsvImportUploadPlan, commandId: string): Promise<CsvImportJob> {
  // Raw cells are only used by the preview; omit them to avoid duplicating every CSV row in the job.
  const payload = JSON.parse(JSON.stringify(plan, (key, value) => key === 'rawRow' ? undefined : value)) as CsvImportUploadPlan;
  return apiRequest('/api/csv-imports', { method: 'POST', body: {
    commandId, filename, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, plan: payload,
  } });
}
export const getCsvImports = () => apiRequest<CsvImportJob[]>('/api/csv-imports');
export const csvImportRunning = (job: CsvImportJob) => job.status === 'queued' || job.status === 'running';
export function csvImportCounts(result: CsvImportResult): CsvImportCounts {
  return { items: result.successItems + result.updatedItems, assemblies: result.successAssemblies,
    events: result.successEvents, orders: result.successOrders, generalOrders: result.successGeneralOrders,
    returns: result.successReturns, checkouts: result.successCheckouts, operations: result.successOperations };
}
