import { type Item, EVENT_TYPES, type EventType, type EventReportStatus } from '../../types';
import { type ParsedEventReportRow, type ParsedAssemblyComponent } from '../../types/csvImport';
import { parseInlineComponents, getField, EVENT_REPORT_TYPE_ALIASES, EVENT_DATE_ALIASES, EVENT_STATUS_ALIASES, EVENT_PLANNED_ALIASES, EVENT_USED_ALIASES, HINT_ALIASES } from './core';

/**
 * Parses event history rows from a combined CSV. Event quantities use the same
 * compact syntax as assemblies, for example "Cable reel: 4; Floodlight: 2".
 */
export function parseEventReportsFromCsv(
  rows: Record<string, string>[],
  items: Item[],
): ParsedEventReportRow[] {
  const itemLookup = new Map<string, Item>();
  for (const item of items) {
    itemLookup.set(item.name.toLowerCase().trim(), item);
    itemLookup.set(item.id.toLowerCase().trim(), item);
    if (item.sku) itemLookup.set(item.sku.toLowerCase().trim(), item);
  }

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

    const rawEventType = getField(raw, EVENT_REPORT_TYPE_ALIASES)?.toUpperCase().trim();
    const eventType = (EVENT_TYPES as readonly string[]).includes(rawEventType ?? '') ? rawEventType as EventType : undefined;
    const eventDate = getField(raw, EVENT_DATE_ALIASES) ?? '';
    const rawStatus = getField(raw, EVENT_STATUS_ALIASES)?.toLowerCase().trim();
    const status: EventReportStatus = ['planned', 'geplant'].includes(rawStatus ?? '') ? 'planned' : 'completed';
    const planned = resolve(getField(raw, EVENT_PLANNED_ALIASES));
    const used = resolve(getField(raw, EVENT_USED_ALIASES));
    const unmatched = [...planned.components, ...used.components].filter((component) => !component.matched);

    let validationStatus: ParsedEventReportRow['status'] = 'valid';
    let statusMessage: string | undefined;
    if (!eventType) {
      validationStatus = 'error';
      statusMessage = 'Unbekannter oder fehlender Eventtyp';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(`${eventDate}T00:00:00Z`))) {
      validationStatus = 'error';
      statusMessage = 'Eventdatum muss im Format JJJJ-MM-TT angegeben werden';
    } else if (unmatched.length > 0) {
      validationStatus = 'error';
      statusMessage = `Unbekannte Artikel: ${[...new Set(unmatched.map((component) => component.itemName))].join(', ')}`;
    }

    results.push({
      index: index + 1,
      data: {
        eventType: eventType ?? 'LS',
        eventDate,
        status,
        itemIds: Object.keys(used.quantities),
        plannedQuantities: planned.quantities,
        usedQuantities: used.quantities,
        notes: getField(raw, HINT_ALIASES) ?? '',
      },
      rawRow: raw,
      plannedItems: planned.components,
      usedItems: used.components,
      status: validationStatus,
      statusMessage,
    });
  }
  return results;
}
