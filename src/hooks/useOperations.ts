import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProgressiveList } from './useProgressiveList';
import { useUIStore } from '../store/uiStore';
import { translate } from '../utils/naming';

export function useOperationList<T>(key: string, getPage: (page: number, size: number) => Promise<T[]>, enabled = true) {
  return useProgressiveList<T>(['operations', key], getPage, { enabled });
}

export function useOperationCommand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: () => Promise<unknown>) => command(),
    onSuccess: () => {
      void client.invalidateQueries();
      useUIStore.getState().showSnackbar(translate('Gespeichert', 'Saved'), 'success');
    },
  });
}
