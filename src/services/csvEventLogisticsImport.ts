import { apiRequest } from './apiClient';
import { assertAuthSession, captureAuthSession } from './authManager';
import type { EventAttendee, EventPersonSummary, EventTimelineEntry } from '../types/eventLogistics';
import type { ParsedEventReportRow } from '../types/csvImport';
import { translate } from '../utils/naming';

/** Reuse people across events and update matching records when an import is retried. */
export function createCsvEventLogisticsImporter() {
  const context = captureAuthSession();
  let people: EventPersonSummary[] | undefined;
  return async (eventId: string, row: ParsedEventReportRow) => {
    assertAuthSession(context);
    const base = `/api/events/${eventId}`;
    if (row.attendees.length) {
      people ??= await apiRequest<EventPersonSummary[]>('/api/event-people');
      const known = people;
      // Resolve every name before writing so an ambiguous name leaves the event untouched.
      const resolved = row.attendees.map((input) => {
        const matches = known.filter((person) => person.name.toLowerCase().trim() === input.personName.toLowerCase());
        if (matches.length > 1) throw new Error(translate(`Mehrere Personen heißen ${input.personName}`, `Multiple people are named ${input.personName}`));
        return { input, person: matches.at(0) };
      });
      const attendees = await apiRequest<EventAttendee[]>(`${base}/attendees`);
      for (const { input, person } of resolved) {
        assertAuthSession(context);
        const existing = attendees.find((attendee) => attendee.person.id === person?.id);
        const saved = await apiRequest<EventAttendee>(existing ? `${base}/attendees/${existing.id}` : `${base}/attendees`, {
          method: existing ? 'PUT' : 'POST',
          body: { ...input, personId: person?.id ?? null, personName: person?.name ?? input.personName, personUserId: person?.userId ?? null },
        });
        if (!person) people.push(saved.person);
      }
    }
    if (row.timeline.length) {
      const timeline = await apiRequest<EventTimelineEntry[]>(`${base}/timeline`);
      for (const input of row.timeline) {
        assertAuthSession(context);
        const existing = timeline.find((entry) => entry.category === input.category && entry.title === input.title
          && Date.parse(`${entry.startsAt}Z`) === Date.parse(`${input.startsAt}Z`));
        await apiRequest(existing ? `${base}/timeline/${existing.id}` : `${base}/timeline`, {
          method: existing ? 'PUT' : 'POST', body: input,
        });
      }
    }
  };
}
