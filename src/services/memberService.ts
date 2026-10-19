import { apiPage, apiRequest } from './apiClient';
import { fieldCommand } from './fieldCommand';
import type { MemberAssignment, MemberCustody, MemberDecisionInput, MemberRequest, MemberRequestInput, MemberReturnInput, MemberStored } from '../types/member';
export const memberApi = {
  custody: () => apiRequest<MemberCustody[]>('/api/member/custody'),
  storage: () => apiRequest<MemberStored[]>('/api/member/storage'),
  requests: (page: number, size: number) => apiPage<MemberRequest>('/api/member/requests', page, size),
  assignments: () => apiRequest<MemberAssignment[]>('/api/member/assignments'),
  request: (body: MemberRequestInput) => apiRequest<MemberRequest>('/api/member/requests', { method: 'POST', body }),
  submitReturn: (body: MemberReturnInput) => fieldCommand<{ id: string }>({ type: 'member.return', payload: body }, body.commandId),
  decide: (id: string, body: MemberDecisionInput) => apiRequest<MemberRequest>(`/api/member/requests/${id}`, { method: 'POST', body }),
  assign: (id: string, userId: string | null) => apiRequest<void>(`/api/member/assignments/${id}`, { method: 'PUT', body: { userId } }),
};
