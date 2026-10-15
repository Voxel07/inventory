import type { Faction } from '../types';
import { apiRequest } from './apiClient';
import { assertAuthSession, captureAuthSession } from './authManager';

/** Resolve preview IDs before attendee roles are saved; retry reuses existing factions. */
export async function importCsvFactions(planned: readonly Faction[]): Promise<ReadonlyMap<string, string>> {
  const ids = new Map<string, string>();
  if (!planned.length) return ids;
  const context = captureAuthSession();
  const existing = [...await apiRequest<Faction[]>('/api/factions', { session: context })];
  for (const faction of planned) {
    assertAuthSession(context);
    let saved = existing.find((entry) => entry.eventType === faction.eventType
      && entry.name.trim().toLowerCase() === faction.name.toLowerCase());
    if (!saved) {
      saved = await apiRequest<Faction>('/api/factions', { method: 'POST', session: context,
        body: { eventType: faction.eventType, name: faction.name, active: true } });
      existing.push(saved);
    }
    ids.set(faction.id, saved.id);
  }
  return ids;
}
