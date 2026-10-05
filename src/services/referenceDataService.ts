import type { EventType, Faction } from '../types';
import { apiRequest, ApiError } from './apiClient';
import { assertAuthSession, captureAuthSession } from './authManager';
import { getOfflineCatalog, setOfflineCatalog } from './offlineQueue';

/** Reference data is cached per account for cold offline starts. */
async function referenceData<T>(path: string, key: string): Promise<T> {
  const context = captureAuthSession();
  try {
    const data = await apiRequest<T>(path, { session: context });
    assertAuthSession(context);
    await setOfflineCatalog(key, data, context);
    return data;
  } catch (error) {
    assertAuthSession(context);
    if (error instanceof ApiError && error.status < 500) throw error;
    const cached = await getOfflineCatalog<T>(key, context);
    assertAuthSession(context);
    if (cached) return cached;
    throw error;
  }
}

export const getFactions = () => referenceData<Faction[]>('/api/factions', 'factions');
export const getEventTypes = () => referenceData<EventType[]>('/api/event-types', 'eventTypes');
