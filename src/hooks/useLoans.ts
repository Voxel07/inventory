import { queryKeys } from '../utils/queryKeys';
import { loanApi } from '../services/loanService';
import { usePagedList } from './usePagedList';
export const useLoans = (query: Record<string, string> = {}) => usePagedList([...queryKeys.loans(), query], (page, size) => loanApi.list(page, size, query), { size: 25 });
