import { ATTENDEE_ROLES, FACTION_ROLES, type AttendeeRoleKind, type EventAttendeeInput, type EventTimelineInput } from '../../types/eventLogistics';
import type { CsvReference } from './reference';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ein JSON-Objekt wird erwartet');
  return value as Record<string, unknown>;
}

function list(value: string | undefined): Record<string, unknown>[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Eine JSON-Liste wird erwartet');
  return parsed.map(object);
}

function text(value: unknown, required = false, max = 255): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max) {
    throw new Error(`Text${required ? ' (Pflichtfeld)' : ''} mit maximal ${max} Zeichen wird erwartet`);
  }
  return value.trim();
}

export function isCsvDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function time(value: unknown, required = false): string | null {
  if ((value == null || value === '') && !required) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)
    || !isCsvDate(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23
    || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    throw new Error('Zeit muss im Format JJJJ-MM-TTTHH:mm[:ss] ohne Zeitzone angegeben werden');
  }
  return value.length === 16 ? `${value}:00` : value;
}

function range(start: string | null, end: string | null) {
  if (start && end && end < start) throw new Error('Endzeit darf nicht vor der Startzeit liegen');
}

export function parseEventAttendees(value: string | undefined, eventType: string, reference: CsvReference): EventAttendeeInput[] {
  const names = new Set<string>();
  return list(value).map((entry, index) => {
    try {
      const personName = text(entry.personName, true);
      const key = personName.toLowerCase();
      if (names.has(key)) throw new Error(`Teilnehmer doppelt angegeben: ${personName}`);
      names.add(key);
      const arrivesAt = time(entry.arrivesAt);
      const leavesAt = time(entry.leavesAt);
      range(arrivesAt, leavesAt);
      if (entry.foodStampsIssued != null && typeof entry.foodStampsIssued !== 'boolean') throw new Error('foodStampsIssued muss ein Boolean sein');
      if (!Array.isArray(entry.roles) || !entry.roles.length || entry.roles.length > 20) throw new Error('1 bis 20 Rollen werden benötigt');
      const seenRoles = new Set<string>();
      const roles = entry.roles.map((value: unknown) => {
        const input = object(value);
        const role = text(input.role, true) as AttendeeRoleKind;
        if (!ATTENDEE_ROLES.includes(role)) throw new Error(`Unbekannte Rolle: ${role}`);
        const factionName = text(input.faction);
        const faction = reference.factions.find((faction) => faction.eventType === eventType
          && faction.name.toLowerCase() === factionName.toLowerCase());
        if (FACTION_ROLES.includes(role) ? !faction : Boolean(factionName)) throw new Error(`Ungültige Fraktion für Rolle ${role}: ${factionName}`);
        const assignment = text(input.assignment) || null;
        if (assignment && role !== 'event_crew') throw new Error('Nur Event-Crew kann eine Aufgabe haben');
        const key = `${role}:${faction?.id ?? ''}`;
        if (seenRoles.has(key)) throw new Error(`Doppelte Rolle: ${role}`);
        seenRoles.add(key);
        return { role, factionId: faction?.id ?? null, assignment };
      });
      return { personId: null, personUserId: null, personName, arrivesAt, leavesAt,
        foodStampsIssued: entry.foodStampsIssued === true, notes: text(entry.notes, false, 2000), roles };
    } catch (error) {
      throw new Error(`Teilnehmer ${index + 1}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  });
}

export function parseEventTimeline(value: string | undefined): EventTimelineInput[] {
  const keys = new Set<string>();
  return list(value).map((entry, index) => {
    try {
      const category = text(entry.category, true);
      if (category !== 'preparation' && category !== 'in_game') throw new Error(`Unbekannte Zeitplankategorie: ${category}`);
      const status = text(entry.status ?? 'planned');
      if (status !== 'planned' && status !== 'in_progress' && status !== 'completed') throw new Error(`Unbekannter Zeitplanstatus: ${status}`);
      const title = text(entry.title, true);
      const startsAt = time(entry.startsAt, true)!;
      const endsAt = time(entry.endsAt);
      range(startsAt, endsAt);
      const key = JSON.stringify([category, title, startsAt]);
      if (keys.has(key)) throw new Error(`Doppelter Zeitplaneintrag: ${title}`);
      keys.add(key);
      return { category, status, title, startsAt, endsAt, owner: text(entry.owner),
        location: text(entry.location), description: text(entry.description, false, 2000) };
    } catch (error) {
      throw new Error(`Zeitplaneintrag ${index + 1}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  });
}
