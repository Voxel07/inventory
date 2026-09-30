import { queryKeys } from '../utils/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { loanApi } from '../services/loanService';
export const useLoans = () => useQuery({ queryKey: queryKeys.loans(), queryFn: loanApi.list });
