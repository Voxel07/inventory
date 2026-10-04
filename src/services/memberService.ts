import { apiRequest } from './apiClient';
import type { MemberAssignment, MemberCustody, MemberDecisionInput, MemberRequest, MemberRequestInput, MemberReturnInput, MemberStored } from '../types/member';
export const memberApi = {
  custody: () => apiRequest<MemberCustody[]>('/api/member/custody'),
  storage: () => apiRequest<MemberStored[]>('/api/member/storage'),
  requests: (page = 0) => apiRequest<MemberRequest[]>('/api/member/requests', { query: { page, size: 100 } }),
  assignments: () => apiRequest<MemberAssignment[]>('/api/member/assignments'),
  request: (body: MemberRequestInput) => apiRequest<MemberRequest>('/api/member/requests', { method: 'POST', body }),
  submitReturn: (body: MemberReturnInput) => apiRequest<{ id: string }>('/api/member/returns', { method: 'POST', body }),
  decide: (id: string, body: MemberDecisionInput) => apiRequest<MemberRequest>(`/api/member/requests/${id}`, { method: 'POST', body }),
  assign: (id: string, userId: string | null) => apiRequest<void>(`/api/member/assignments/${id}`, { method: 'PUT', body: { userId } }),
};
