let epoch = 0;
const listeners = new Set<() => void>();
let stop: (() => void) | undefined;
export const getPrivateMediaEpoch = () => epoch;
export function subscribePrivateMediaEpoch(listener: () => void): () => void {
  listeners.add(listener);
  if (!stop) {
    const invalidate = () => { epoch++; listeners.forEach(notify => notify()); };
    const foreground = () => { if (document.visibilityState === 'visible') invalidate(); };
    const interval = window.setInterval(invalidate, 60_000);
    window.addEventListener('ash-api-change', invalidate);
    window.addEventListener('offline', invalidate);
    window.addEventListener('online', invalidate);
    document.addEventListener('visibilitychange', foreground);
    stop = () => {
      window.clearInterval(interval);
      window.removeEventListener('ash-api-change', invalidate);
      window.removeEventListener('offline', invalidate);
      window.removeEventListener('online', invalidate);
      document.removeEventListener('visibilitychange', foreground);
    };
  }
  return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined; } };
}
