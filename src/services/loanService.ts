import { apiRequest } from './apiClient';
import { captureAuthSession, assertAuthSession } from './authManager';
import type { Loan, LoanExtensionInput, LoanInput, LoanMovementInput } from '../types/loan';
export const loanApi = {
  list: (page = 0) => apiRequest<Loan[]>('/api/loans', { query: { page, size: 100 } }),
  find: async (predicate: (loan: Loan) => boolean) => {
    const session = captureAuthSession();
    for (let page = 0; ; page++) {
      const rows = await apiRequest<Loan[]>('/api/loans', { query: { page, size: 100 }, session });
      assertAuthSession(session);
      const found = rows.find(predicate);
      if (found || rows.length < 100) return found;
    }
  },
  create: (body: LoanInput) => apiRequest<Loan>('/api/loans', { method: 'POST', body }),
  move: (id: string, action: 'collect' | 'return', body: LoanMovementInput) => apiRequest<Loan>(`/api/loans/${id}/${action}`, { method: 'POST', body }),
  extend: (id: string, body: LoanExtensionInput) => apiRequest<Loan>(`/api/loans/${id}/extend`, { method: 'POST', body }),
};
