import { useCallback, useSyncExternalStore } from 'react';

const resources = new WeakMap<File, { url: string; subscribers: number }>();

/** Object URLs are external resources, acquired on subscription and released on unmount. */
export function useObjectUrl(file?: File) {
  const subscribe = useCallback(() => {
    if (!file) return () => {};
    let resource = resources.get(file);
    if (!resource) {
      resource = { url: URL.createObjectURL(file), subscribers: 0 };
      resources.set(file, resource);
    }
    resource.subscribers++;
    return () => {
      resource.subscribers--;
      if (resource.subscribers === 0) {
        URL.revokeObjectURL(resource.url);
        resources.delete(file);
      }
    };
  }, [file]);
  const snapshot = useCallback(() => file ? resources.get(file)?.url : undefined, [file]);
  return useSyncExternalStore(subscribe, snapshot, () => undefined);
}
