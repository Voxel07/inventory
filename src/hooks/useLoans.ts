import { queryKeys } from '../utils/queryKeys';
import { loanApi } from '../services/loanService';
import { usePagedList } from './usePagedList';
export const useLoans = () => usePagedList(queryKeys.loans(), loanApi.list);
