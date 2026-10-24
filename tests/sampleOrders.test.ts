import { expect, test } from 'bun:test';
import { parseCsv } from '../src/utils/csv/core';
import { parseFactionOrdersFromCsv, parseGeneralOrdersFromCsv } from '../src/utils/csv/orders';
import { parseEventReportsFromCsv } from '../src/utils/csv/events';
import { generateSampleCombinedCsv } from '../src/utils/csv/templates';
import type { CsvReference } from '../src/utils/csv/reference';
import type { EventType, Faction, Item } from '../src/types';

const { rows } = parseCsv(await Bun.file('sample_imports/sample_stock.csv').text());
const items = rows.filter((row) => row.Typ === 'Artikel').map((row, index) => ({
  id: `item-${index}`, name: row.Name, isConsumable: row.Verbrauchsmaterial === 'Ja',
} as Item));
const factions: [EventType, string][] = [['DE', 'KGG'], ['DE', 'GOF'], ['DE', 'Enklave'], ['DE', 'Miliz'], ['LS', 'UCRF'], ['LS', 'TERA']];
const reference: CsvReference = {
  eventTypes: ['ASD', 'DE', 'LA', 'LS', 'M24', 'PBG', 'TNO'],
  factions: factions.map(([eventType, name]) => ({ id: name, eventType, name, slug: name.toLowerCase() } as Faction)),
};

test('every sample order row is valid', () => {
  const faction = parseFactionOrdersFromCsv(rows, items, reference);
  const general = parseGeneralOrdersFromCsv(rows, items, reference);
  expect(faction.filter((row) => row.status === 'error').map((row) => `${row.index}: ${row.statusMessage}`)).toEqual([]);
  expect(general.filter((row) => row.status === 'error').map((row) => `${row.index}: ${row.statusMessage}`)).toEqual([]);
});

test('sample has finished orders of past events and open ones to prepare', () => {
  const today = Date.UTC(2026, 9, 5);
  const faction = parseFactionOrdersFromCsv(rows, items, reference);
  const general = parseGeneralOrdersFromCsv(rows, items, reference);
  const finished = ['returned', 'closed'];
  expect(faction.some((row) => row.data.eventType === 'DE' && finished.includes(row.targetStatus))).toBe(true);
  expect(faction.filter((row) => row.data.eventDate < today).every((row) => finished.includes(row.targetStatus))).toBe(true);
  expect(general.filter((row) => row.eventDate < today && finished.includes(row.targetStatus)).length).toBeGreaterThanOrEqual(5);
  expect(faction.some((row) => row.targetStatus === 'submitted' && row.data.eventDate > today)).toBe(true);
});

test('orders past "ready" need an exact pickup point', () => {
  const header = 'Typ;Eventtyp;Eventdatum;Fraktion;Bestellte Artikel;Bestellstatus;Abholpunkt';
  const parse = (status: string, point: string) => parseFactionOrdersFromCsv(
    parseCsv(`${header}\nBestellung;LS;14-06-2025;TERA;Biertisch: 1;${status};${point}`).rows, items, reference)[0];
  expect(parse('Abgeschlossen', '').status).toBe('error');
  expect(parse('Abgeschlossen', 'irgendwo').status).toBe('error');
  expect(parse('Eingereicht', '').status).toBe('valid');
  const valid = parse('Abgeschlossen', '50.5520, 9.6800');
  expect(valid.status).toBe('valid');
  expect(valid.pickupPoint).toEqual({ latitude: 50.552, longitude: 9.68 });
});

test('every sample event has valid attendees, travel times and preparation/game timings', () => {
  const events = parseEventReportsFromCsv(rows, items, reference);
  expect(events).toHaveLength(27);
  expect(events.filter((row) => row.status === 'error').map((row) => `${row.index}: ${row.statusMessage}`)).toEqual([]);
  for (const event of events) {
    expect(event.data.name).toBe(event.rawRow.Name);
    expect(event.data.startDate).toBe(event.data.eventDate);
    expect(event.data.endDate! > event.data.startDate!).toBe(true);
    expect(event.attendees).toHaveLength(6);
    expect(event.attendees.every((person) => person.arrivesAt && person.leavesAt && person.roles.length)).toBe(true);
    expect(event.timeline.length).toBeGreaterThanOrEqual(4);
    expect(event.timeline.some((entry) => entry.category === 'in_game')).toBe(true);
    expect(event.timeline.some((entry) => entry.category === 'preparation')).toBe(true);
    expect(event.timeline.every((entry) => entry.status === event.data.status)).toBe(true);
  }
  expect(events.find((event) => event.data.eventType === 'DE')?.attendees[0].roles[0].factionId).toBe('KGG');
  expect(events.find((event) => event.data.name === 'Tschernobyl 2027')?.timeline.filter((entry) => entry.category === 'catering')).toHaveLength(14);
});

test('downloadable combined template includes a valid event with logistics', () => {
  const event = parseEventReportsFromCsv(parseCsv(generateSampleCombinedCsv()).rows, [], reference)[0];
  expect(event.status).toBe('valid');
  expect(event.attendees[0].personName).toBe('Alex König');
  expect(event.timeline).toHaveLength(2);
});

test('event validation rejects malformed logistics and invalid calendar/time ranges', () => {
  const base = { Typ: 'Event', Eventtyp: 'DE', Eventdatum: '17-10-2026' };
  const attendee = { personName: 'Person', roles: [{ role: 'event_crew' }] };
  const timeline = { category: 'in_game', title: 'Briefing', startsAt: '17-10-2026 09:00' };
  for (const invalid of [
    { Teilnehmer: '{broken' }, { Teilnehmer: '{}' }, { Teilnehmer: '[null]' },
    { Teilnehmer: JSON.stringify([{ ...attendee, roles: [] }]) },
    { Teilnehmer: JSON.stringify([{ ...attendee, roles: [{ role: 'faction_leader', faction: 'TERA' }] }]) },
    { Teilnehmer: JSON.stringify([{ ...attendee, roles: [{ role: 'event_crew', faction: 'KGG' }] }]) },
    { Teilnehmer: JSON.stringify([{ ...attendee, roles: [{ role: 'as_held', assignment: 'Task' }] }]) },
    { Teilnehmer: JSON.stringify([{ ...attendee, roles: [{ role: 'unknown' }] }]) },
    { Teilnehmer: JSON.stringify([{ ...attendee, roles: [{ role: 'event_crew' }, { role: 'event_crew' }] }]) },
    { Teilnehmer: JSON.stringify([{ ...attendee, foodStampsIssued: 'false' }]) },
    { Teilnehmer: JSON.stringify([attendee, attendee]) },
    { Teilnehmer: JSON.stringify([{ ...attendee, arrivesAt: '17-10-2026 10:00', leavesAt: '17-10-2026 09:00' }]) },
    { Eventdatum: '30-02-2026' }, { Enddatum: '16-10-2026' },
    { Zeitplan: JSON.stringify([{ ...timeline, startsAt: '17-10-2026 25:00' }]) },
    { Zeitplan: JSON.stringify([{ ...timeline, startsAt: '2026-10-17T09:00Z' }]) },
    { Zeitplan: JSON.stringify([{ ...timeline, endsAt: '17-10-2026 08:00' }]) },
    { Zeitplan: JSON.stringify([{ ...timeline, category: 'unknown' }]) },
    { Zeitplan: JSON.stringify([{ ...timeline, status: 'unknown' }]) },
    { Zeitplan: JSON.stringify([timeline, timeline]) },
  ]) {
    expect(parseEventReportsFromCsv([{ ...base, ...invalid }], [], reference)[0].status).toBe('error');
  }
  const valid = parseEventReportsFromCsv([{ ...base, attendees: JSON.stringify([attendee]), timeline: JSON.stringify([timeline]) }], [], reference)[0];
  expect(valid.status).toBe('valid');
  expect(valid.timeline[0].startsAt).toBe(new Date(2026, 9, 17, 9).getTime());
  expect(valid.timeline[0].status).toBe('planned');
});
