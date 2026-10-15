import type { EventType, Faction } from '../../types';
import { EVENT_REPORT_TYPE_ALIASES, EVENT_TYPES_ALIASES, ORDER_FACTION_ALIASES, getField } from './core';
import { FACTION_ROLES } from '../../types/eventLogistics';

/** Event types and factions from the API that imported rows are validated against. */
export interface CsvReference {
  eventTypes: readonly EventType[];
  factions: readonly Faction[];
}

/** Plan references supplied by an admin importing a CSV. No API writes occur here. */
export function planCsvReferences(rows: Record<string, string>[], catalog: CsvReference): CsvReference & { newFactions: Faction[] } {
  const eventTypes = new Set(catalog.eventTypes);
  const factions = [...catalog.factions];
  const newFactions: Faction[] = [];
  function addFaction(eventType: string, value: unknown) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 255) return;
    const name = value.trim();
    if (knownFaction({ eventTypes: [...eventTypes], factions }, eventType, name)) return;
    const faction = { id: `csv-faction-${newFactions.length + 1}`, eventType, name, slug: '', active: true };
    factions.push(faction);
    newFactions.push(faction);
  }
  for (const row of rows) {
    const eventType = getField(row, EVENT_REPORT_TYPE_ALIASES)?.toUpperCase();
    for (const tag of (getField(row, EVENT_TYPES_ALIASES) ?? '').split(/[,;|/]+/)) {
      if (tag.trim() && tag.trim().length <= 255) eventTypes.add(tag.trim().toUpperCase());
    }
    if (!eventType || eventType.length > 255) continue;
    eventTypes.add(eventType);
    addFaction(eventType, getField(row, ORDER_FACTION_ALIASES));
    const attendees = getField(row, ['Teilnehmer', 'attendees']);
    if (!attendees) continue;
    try {
      const entries: unknown = JSON.parse(attendees);
      if (!Array.isArray(entries)) continue;
      for (const attendee of entries) {
        if (!attendee || !Array.isArray(attendee.roles)) continue;
        for (const role of attendee.roles) {
          if (role && FACTION_ROLES.includes(role.role)) addFaction(eventType, role.faction);
        }
      }
    } catch {
      // The event parser reports malformed attendee data on its source row.
    }
  }
  return { eventTypes: [...eventTypes], factions, newFactions };
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
