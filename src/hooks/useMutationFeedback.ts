import { useUIStore } from '../store/uiStore';
import { translate } from '../utils/naming';
import { isOfflineQueuedError } from '../utils/offline';

export function useMutationFeedback(fallback = translate('Aktion fehlgeschlagen', 'Action failed')) {
  const show = useUIStore((state) => state.showSnackbar);
  const success = (message: string) => show(message, 'success');
  const failure = (message: string) => show(message, 'error');
  const error = (reason: unknown) => {
    if (!isOfflineQueuedError(reason)) show(reason instanceof Error ? reason.message : fallback, 'error');
  };
  const callbacks = (message: string, onSuccess?: () => void) => ({
    onSuccess: () => { onSuccess?.(); success(message); },
    onError: (reason: unknown) => error(reason),
  });
  return { success, failure, error, callbacks };
}

