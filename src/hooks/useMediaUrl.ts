import { useEffect, useState, useSyncExternalStore } from 'react';
import { fetchMedia, getAuthSnapshot, isApiMediaUrl, subscribeAuth } from '../services/apiClient';

export function useMediaUrl(source?: string): string | undefined {
  const { token } = useSyncExternalStore(subscribeAuth, getAuthSnapshot);
  const [loaded, setLoaded] = useState<{ source: string; token: string; url: string }>();
  const protectedMedia = Boolean(source && isApiMediaUrl(source));

  useEffect(() => {
    if (!source || !protectedMedia || !token) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void fetchMedia(source, controller.signal).then((blob) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ source, token, url: objectUrl });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) console.error('Could not load image', error);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, protectedMedia, token]);

  if (!protectedMedia) return source;
  return loaded?.source === source && loaded?.token === token ? loaded.url : undefined;
}
