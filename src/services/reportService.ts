import { apiRequest } from './apiClient';
import { assertAuthSession, captureAuthSession } from './authManager';
import type { OperationalReport, ReportFilters } from '../types/report';
export const reportApi = {
  definitions: () => apiRequest<Record<string, string>>('/api/reports'),
  get: (name: string, filters: ReportFilters, page: number, size: number) => apiRequest<OperationalReport>(`/api/reports/${name}`, { query: { ...filters, page, size } }),
  rebuild: (name: string) => apiRequest<OperationalReport>(`/api/reports/${name}/rebuild`, { method: 'POST' }),
  async exportRows(name: string, filters: ReportFilters, generationChangedMessage: string) {
    const context = captureAuthSession();
    const first = await reportApi.get(name, filters, 0, 200);
    assertAuthSession(context);
    if (!first.generatedAt || first.rows.length >= first.total) return { rows: first.rows, generation: first.generatedAt };
    const data = await apiRequest<OperationalReport>(`/api/reports/${name}/export`, {
      query: { ...filters, generation: first.generatedAt }, session: context,
    });
    assertAuthSession(context);
    if (data.generatedAt !== first.generatedAt) throw new Error(generationChangedMessage);
    return { rows: data.rows, generation: data.generatedAt };
  },
};
