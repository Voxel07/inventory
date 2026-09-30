import { apiRequest } from './apiClient';
import type { OperationalReport, ReportFilters, ReportRow } from '../types/report';
export const reportApi = {
  definitions: () => apiRequest<Record<string, string>>('/api/reports'),
  get: (name: string, filters: ReportFilters, page: number, size: number) => apiRequest<OperationalReport>(`/api/reports/${name}`, { query: { ...filters, page, size } }),
  rebuild: (name: string) => apiRequest<OperationalReport>(`/api/reports/${name}/rebuild`, { method: 'POST' }),
  async exportRows(name: string, filters: ReportFilters, generationChangedMessage: string) {
    const rows: ReportRow[] = [];
    let generation: string | null | undefined;
    for (let index = 0; ; index++) {
      const data = await reportApi.get(name, filters, index, 200);
      if (generation !== undefined && generation !== data.generatedAt) throw new Error(generationChangedMessage);
      generation = data.generatedAt;
      rows.push(...data.rows);
      if (rows.length >= data.total || !data.rows.length) return { rows, generation };
    }
  },
};
