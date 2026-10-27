import { getPrivateMediaEpoch, subscribePrivateMediaEpoch } from '../services/privateMediaEpoch';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchMedia, getAuthSnapshot, isApiMediaUrl, subscribeAuth } from '../services/apiClient';

const MAX_CACHED = 200;
/**
 * Downloads shared by every image of one session and access epoch. A token refresh keeps them; a new session or an
 * access change (epoch) starts over, so revoked media is fetched (and rejected) again.
 */
const downloads = new Map<string, Promise<Blob>>();
let cacheScope = '';

function download(source: string, generation: number, epoch: number): Promise<Blob> {
  const scope = `${generation}:${epoch}`;
  if (scope !== cacheScope) {
    downloads.clear();
    cacheScope = scope;
  }
  let pending = downloads.get(source);
  if (pending) {
    // Most recently used last, so the oldest download is evicted first.
    downloads.delete(source);
  } else {
    pending = fetchMedia(source);
    pending.catch(() => { if (downloads.get(source) === pending) downloads.delete(source); });
  }
  downloads.set(source, pending);
  if (downloads.size > MAX_CACHED) downloads.delete(downloads.keys().next().value!);
  return pending;
}

export function useMediaUrl(source?: string): string | undefined {
  const epoch = useSyncExternalStore(subscribePrivateMediaEpoch, getPrivateMediaEpoch);
  const { token, generation } = useSyncExternalStore(subscribeAuth, getAuthSnapshot);
  const signedIn = Boolean(token);
  const [loaded, setLoaded] = useState<{ source: string; generation: number; epoch: number; url: string }>();
  const protectedMedia = Boolean(source && isApiMediaUrl(source));

  useEffect(() => {
    if (!source || !protectedMedia || !signedIn || !navigator.onLine) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    void download(source, generation, epoch).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ source, generation, epoch, url: objectUrl });
    }).catch((error: unknown) => {
      if (!cancelled) console.error('Could not load image', error);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, protectedMedia, signedIn, generation, epoch]);

  if (!protectedMedia) return source;
  return loaded?.source === source && loaded?.generation === generation && loaded?.epoch === epoch ? loaded.url : undefined;
}
