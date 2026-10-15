import { apiPage, apiRequest } from './apiClient';
import { captureAuthSession, assertAuthSession } from './authManager';
import type { Loan, LoanExtensionInput, LoanInput, LoanMovementInput } from '../types/loan';
export const loanApi = {
  list: (page: number, size: number) => apiPage<Loan>('/api/loans', page, size),
  find: async (predicate: (loan: Loan) => boolean) => {
    const session = captureAuthSession();
    for (let page = 0; ; page++) {
      const batch = await apiPage<Loan>('/api/loans', page, 100, { session });
      assertAuthSession(session);
      const found = batch.rows.find(predicate);
      if (found || !batch.more) return found;
    }
  },
  create: (body: LoanInput) => apiRequest<Loan>('/api/loans', { method: 'POST', body }),
  move: (id: string, action: 'collect' | 'return', body: LoanMovementInput) => apiRequest<Loan>(`/api/loans/${id}/${action}`, { method: 'POST', body }),
  extend: (id: string, body: LoanExtensionInput) => apiRequest<Loan>(`/api/loans/${id}/extend`, { method: 'POST', body }),
};
