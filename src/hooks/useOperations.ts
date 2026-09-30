import { translate } from '../utils/naming';
import { useMutation } from '@tanstack/react-query';
import { useProgressiveList } from './useProgressiveList';
import { useMutationFeedback } from './useMutationFeedback';
import { queryKeys } from '../utils/queryKeys';

export function useOperationList<T>(key: string, getPage: (page: number, size: number) => Promise<T[]>, enabled = true) {
  return useProgressiveList<T>(queryKeys.operations(key), getPage, { enabled });
}

export function useOperationCommand() {
  const feedback = useMutationFeedback();
  return useMutation({
    mutationFn: (command: () => Promise<unknown>) => command(),
    onSuccess: () => {
      // apiRequest broadcasts each successful write to the app's shared invalidation policy.
      feedback.success(translate('Gespeichert', 'Saved'));
    },
  });
}
