import { queryKeys } from '../utils/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { reportApi } from '../services/reportService';
import type { ReportFilters } from '../types/report';
export const useReportDefinitions = () => useQuery({ queryKey: queryKeys.reportDefinitions(), queryFn: reportApi.definitions });
export const useOperationalReport = (name: string, filters: ReportFilters, page: number) => useQuery({ queryKey: queryKeys.report(name, filters, page), queryFn: () => reportApi.get(name, filters, page, 50), refetchInterval: 60_000 });
