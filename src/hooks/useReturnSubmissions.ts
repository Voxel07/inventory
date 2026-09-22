import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReturnSubmissionFormData, ReturnSubmissionStatus } from '../types';
import {
  acknowledgeReturnSubmission,
  createReturnSubmission,
  getReturnSubmissions,
  rejectReturnSubmission,
} from '../services/returnSubmissionService';

export function useReturnSubmissions(status?: ReturnSubmissionStatus) {
  return useQuery({
    queryKey: ['return-submissions', status ?? 'all'],
    queryFn: () => getReturnSubmissions(status),
  });
}

function useReturnMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['return-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['faction-orders'] });
    },
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
