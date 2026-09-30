import { apiRequest } from './apiClient';
import type { InboxAction, ReminderInput } from '../types/actionInbox';
export const actionInboxApi = {
  list: () => apiRequest<InboxAction[]>('/api/action-inbox'),
  remind: (body: ReminderInput) => apiRequest<void>('/api/action-inbox/reminder', { method: 'PUT', body }),
};
