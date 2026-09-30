import { apiRequest } from './apiClient';
import type { Loan, LoanExtensionInput, LoanInput, LoanMovementInput } from '../types/loan';
export const loanApi = {
  list: () => apiRequest<Loan[]>('/api/loans'),
  create: (body: LoanInput) => apiRequest<Loan>('/api/loans', { method: 'POST', body }),
  move: (id: string, action: 'collect' | 'return', body: LoanMovementInput) => apiRequest<Loan>(`/api/loans/${id}/${action}`, { method: 'POST', body }),
  extend: (id: string, body: LoanExtensionInput) => apiRequest<Loan>(`/api/loans/${id}/extend`, { method: 'POST', body }),
};
