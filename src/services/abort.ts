/** Settles with {@code promise} unless {@code signal} aborts first; the underlying work is not cancelled. */
export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** True for both a caller abort and an {@link AbortSignal.timeout} expiry. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
