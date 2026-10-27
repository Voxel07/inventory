import { createItemLookup } from './reference';
import { type Item, type EventReportStatus } from '../../types';
import { csvDate, isCsvDate, parseEventAttendees, parseEventTimeline } from './eventLogistics';
import type { EventAttendeeInput, EventTimelineInput } from '../../types/eventLogistics';
import { knownEventType, type CsvReference } from './reference';
import { type ParsedEventReportRow, type ParsedAssemblyComponent } from '../../types/csvImport';
import { parseInlineComponents, getField, EVENT_REPORT_TYPE_ALIASES, EVENT_DATE_ALIASES, EVENT_STATUS_ALIASES, EVENT_PLANNED_ALIASES, EVENT_USED_ALIASES, HINT_ALIASES } from './core';

/**
 * Parses event history rows from a combined CSV. Event quantities use the same
 * compact syntax as assemblies, for example "Cable reel: 4; Floodlight: 2".
 */
export function parseEventReportsFromCsv(
  rows: Record<string, string>[],
  items: Item[],
  reference: CsvReference,
): ParsedEventReportRow[] {
  const itemLookup = createItemLookup(items);

  function resolve(value: string | undefined): { components: ParsedAssemblyComponent[]; quantities: Record<string, number> } {
    const components: ParsedAssemblyComponent[] = [];
    const quantities: Record<string, number> = {};
    for (const component of parseInlineComponents(value ?? '')) {
      const item = itemLookup.get(component.name.toLowerCase().trim());
      components.push({
        itemName: item?.name ?? component.name,
        quantity: component.quantity,
        itemId: item?.id,
        matched: Boolean(item),
      });
      if (item) quantities[item.id] = (quantities[item.id] ?? 0) + component.quantity;
    }
    return { components, quantities };
  }

  const results: ParsedEventReportRow[] = [];
  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index];
    const rowType = getField(raw, ['type', 'typ', 'art'])?.toLowerCase().trim();
    if (!rowType || !['event', 'ereignis', 'eventbericht', 'eventreport'].includes(rowType)) continue;

    const eventType = knownEventType(reference, getField(raw, EVENT_REPORT_TYPE_ALIASES));
    // Startdatum names the event's first day, so it takes precedence over Eventdatum.
    const startDate = getField(raw, ['startDate', 'Startdatum']) || getField(raw, EVENT_DATE_ALIASES) || '';
    const eventDate = startDate;
    const endDate = getField(raw, ['endDate', 'Enddatum']) || startDate;
    const rawStatus = getField(raw, EVENT_STATUS_ALIASES)?.toLowerCase().trim();
    const status: EventReportStatus = ['planned', 'geplant'].includes(rawStatus ?? '') ? 'planned' : 'completed';
    const planned = resolve(getField(raw, EVENT_PLANNED_ALIASES));
    const used = resolve(getField(raw, EVENT_USED_ALIASES));
    const unmatched = [...planned.components, ...used.components].filter((component) => !component.matched);

    let validationStatus: ParsedEventReportRow['status'] = 'valid';
    let statusMessage: string | undefined;
    let attendees: EventAttendeeInput[] = [];
    let timeline: EventTimelineInput[] = [];
    if (!eventType) {
      validationStatus = 'error';
      statusMessage = 'Unbekannter oder fehlender Eventtyp';
    } else if (!isCsvDate(startDate) || !isCsvDate(endDate) || csvDate(endDate) < csvDate(startDate)) {
      validationStatus = 'error';
      statusMessage = 'Eventdatum/Startdatum und Enddatum müssen gültige Daten (TT-MM-JJJJ) sein; Enddatum darf nicht vor dem Startdatum liegen';
    } else if (unmatched.length > 0) {
      validationStatus = 'error';
      statusMessage = `Unbekannte Artikel: ${[...new Set(unmatched.map((component) => component.itemName))].join(', ')}`;
    }
    if (validationStatus === 'valid') {
      try {
        attendees = parseEventAttendees(getField(raw, ['Teilnehmer', 'attendees']), eventType!, reference);
        timeline = parseEventTimeline(getField(raw, ['Zeitplan', 'timeline', 'timings']));
      } catch (error) {
        validationStatus = 'error';
        statusMessage = error instanceof Error ? error.message : String(error);
      }
    }

    results.push({
      index: index + 1,
      data: {
        eventType: eventType ?? 'LS',
        // An empty Name cell keeps the existing name on re-import instead of blanking it.
        name: getField(raw, ['name', 'eventname']) || undefined,
        eventDate: csvDate(eventDate),
        startDate: csvDate(startDate),
        endDate: csvDate(endDate),
        status,
        itemIds: Object.keys(used.quantities),
        plannedQuantities: planned.quantities,
        usedQuantities: used.quantities,
        notes: getField(raw, HINT_ALIASES) ?? '',
      },
      rawRow: raw,
      plannedItems: planned.components,
      usedItems: used.components,
      attendees,
      timeline,
      status: validationStatus,
      statusMessage,
    });
  }
  return results;
}
