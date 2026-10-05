import { revokesAccess, type ApiChangeDetail } from './apiChanges';
let epoch = 0;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
export const getPrivateMediaEpoch = () => epoch;
export function subscribePrivateMediaEpoch(listener: () => void): () => void {
  listeners.add(listener);
  if (!stop) {
    const invalidate = () => { epoch++; listeners.forEach(notify => notify()); };
    // Private media is refetched only when access may have changed, not on every API change.
    const onChange = (event: Event) => { if (revokesAccess((event as CustomEvent<ApiChangeDetail | undefined>).detail)) invalidate(); };
    window.addEventListener('ash-api-change', onChange);
    window.addEventListener('offline', invalidate);
    window.addEventListener('online', invalidate);
    stop = () => {
      window.removeEventListener('ash-api-change', onChange);
      window.removeEventListener('offline', invalidate);
      window.removeEventListener('online', invalidate);
    };
  }
  return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; } };
}
