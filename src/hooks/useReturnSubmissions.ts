import { useAuth } from './useAuth';
import { canViewOrganization } from '../utils/access';
import { useMutation } from '@tanstack/react-query';
import { usePagedList } from './usePagedList';
import type { ReturnSubmissionFormData, ReturnSubmissionStatus } from '../types';
import {
  acknowledgeReturnSubmission,
  createReturnSubmission,
  getReturnSubmissions,
  rejectReturnSubmission,
} from '../services/returnSubmissionService';

/** Server pages, newest first; further pages load on `fetchNextPage`. */
export function useReturnSubmissions(status?: ReturnSubmissionStatus, options?: { mine?: boolean }) {
  const { user } = useAuth();
  const mine = options?.mine ?? false;
  return usePagedList(['return-submissions', status ?? 'all', mine ? 'mine' : 'visible', user?.id],
    (page, size) => getReturnSubmissions(page, size, status, mine), { enabled: canViewOrganization(user) });
}

function useReturnMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  return useMutation({
    mutationFn,
  });
}

export function useCreateReturnSubmission() {
  return useReturnMutation<ReturnSubmissionFormData>(createReturnSubmission);
}

export function useAcknowledgeReturnSubmission() {
  return useReturnMutation<{ id: string; notes?: string; hoursRun?: number }>(({ id, notes, hoursRun }) => acknowledgeReturnSubmission(id, notes, hoursRun));
}

export function useRejectReturnSubmission() {
  return useReturnMutation<{ id: string; notes?: string }>(({ id, notes }) => rejectReturnSubmission(id, notes));
}
