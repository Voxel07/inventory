import type { EventType, Faction } from '../../types';

/** Event types and factions from the API that imported rows are validated against. */
export interface CsvReference {
  eventTypes: readonly EventType[];
  factions: readonly Faction[];
}

export function knownEventType(reference: CsvReference, value: string | undefined): EventType | undefined {
  const normalized = value?.toUpperCase().trim();
  return normalized && reference.eventTypes.includes(normalized) ? normalized : undefined;
}

/** The canonical faction name for the event type, matched case-insensitively. */
export function knownFaction(reference: CsvReference, eventType: EventType, value: string): string | undefined {
  return reference.factions.find((faction) => faction.eventType === eventType
    && faction.name.toLowerCase() === value.trim().toLowerCase())?.name;
}
