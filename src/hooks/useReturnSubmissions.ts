import { useAuth } from './useAuth';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReturnSubmissionFormData, ReturnSubmissionStatus } from '../types';
import {
  acknowledgeReturnSubmission,
  createReturnSubmission,
  getReturnSubmissions,
  rejectReturnSubmission,
} from '../services/returnSubmissionService';

export function useReturnSubmissions(status?: ReturnSubmissionStatus) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['return-submissions', status ?? 'all', user?.id],
    queryFn: () => getReturnSubmissions(status),
  });
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
  return useReturnMutation<{ id: string; notes?: string }>(({ id, notes }) => acknowledgeReturnSubmission(id, notes));
}

export function useRejectReturnSubmission() {
  return useReturnMutation<{ id: string; notes?: string }>(({ id, notes }) => rejectReturnSubmission(id, notes));
}
