import { apiRequest } from './apiClient';
import { assertAuthSession, captureAuthSession } from './authManager';
import type { OperationalReport, ReportFilters, ReportJob } from '../types/report';
export const reportApi = {
  definitions: () => apiRequest<Record<string, string>>('/api/reports'),
  get: (name: string, filters: ReportFilters, page: number, size: number) => apiRequest<OperationalReport>(`/api/reports/${name}`, { query: { ...filters, page, size } }),
  rebuild: (name: string) => apiRequest<ReportJob>(`/api/reports/${name}/rebuild`, { method: 'POST' }),
  /** Rows plus the metadata (generation, freshness, definition) of the same response that produced them. */
  async exportRows(name: string, filters: ReportFilters, generationChangedMessage: string, notReadyMessage: string) {
    const context = captureAuthSession();
    const first = await reportApi.get(name, filters, 0, 200);
    assertAuthSession(context);
    if (!first.generatedAt) throw new Error(notReadyMessage);
    const result = (report: OperationalReport) => ({ rows: report.rows, generation: report.generatedAt, stale: report.stale, definition: report.definition });
    if (!first.generatedAt || first.rows.length >= first.total) return result(first);
    const data = await apiRequest<OperationalReport>(`/api/reports/${name}/export`, {
      query: { ...filters, generation: first.generatedAt }, session: context,
    });
    assertAuthSession(context);
    if (data.generatedAt !== first.generatedAt) throw new Error(generationChangedMessage);
    return result(data);
  },
};
