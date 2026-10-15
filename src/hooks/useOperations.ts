import { translate } from '../utils/naming';
import { useMutation } from '@tanstack/react-query';
import { usePagedList } from './usePagedList';
import { useMutationFeedback } from './useMutationFeedback';
import { queryKeys } from '../utils/queryKeys';
import type { Page } from '../services/apiPagination';

export function useOperationList<T>(key: string, getPage: (page: number, size: number) => Promise<Page<T>>, enabled = true) {
  return usePagedList<T>(queryKeys.operations(key), getPage, { enabled });
}

export function useOperationCommand() {
  const feedback = useMutationFeedback();
  return useMutation({
    mutationFn: (command: () => Promise<unknown>) => command(),
    onSuccess: () => {
      // apiRequest broadcasts each successful write to the app's shared invalidation policy.
      feedback.success(translate('hooks.useOperations.saved'));
    },
  });
}
