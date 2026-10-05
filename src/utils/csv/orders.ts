import { type Item } from '../../types';
import { knownEventType, knownFaction, type CsvReference } from './reference';
import { type ParsedFactionOrderRow, type ParsedAssemblyComponent, type FactionOrderImportStatus, type ParsedGeneralOrderRow } from '../../types/csvImport';
import { getField, EVENT_REPORT_TYPE_ALIASES, EVENT_DATE_ALIASES, ORDER_FACTION_ALIASES, parseInlineComponents, ORDER_ITEMS_ALIASES, ORDER_STATUS_ALIASES, ORDER_RETURNED_ITEMS_ALIASES, HINT_ALIASES, GENERAL_ORDER_NAME_ALIASES, GENERAL_ORDER_PURPOSE_ALIASES, ORDER_CONSUMED_ITEMS_ALIASES } from './core';

/** Parses draft/submitted faction-order rows from a combined CSV. */
export function parseFactionOrdersFromCsv(
  rows: Record<string, string>[],
  items: Item[],
  reference: CsvReference,
): ParsedFactionOrderRow[] {
  const itemLookup = new Map<string, Item>();
  for (const item of items) {
    itemLookup.set(item.name.toLowerCase().trim(), item);
    itemLookup.set(item.id.toLowerCase().trim(), item);
    if (item.sku) itemLookup.set(item.sku.toLowerCase().trim(), item);
  }

  const results: ParsedFactionOrderRow[] = [];
  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index];
    const rowType = getField(raw, ['type', 'typ', 'art'])?.toLowerCase().trim();
    if (!rowType || !['order', 'bestellung', 'factionorder', 'fraktionsbestellung'].includes(rowType)) continue;

    const eventType = knownEventType(reference, getField(raw, EVENT_REPORT_TYPE_ALIASES));
    const eventDate = getField(raw, EVENT_DATE_ALIASES) ?? '';
    const rawFaction = getField(raw, ORDER_FACTION_ALIASES) ?? '';
    const faction = eventType
      ? knownFaction(reference, eventType, rawFaction)
      : undefined;
    const requestedItems: ParsedAssemblyComponent[] = [];
    const requestedQuantities: Record<string, number> = {};
    for (const component of parseInlineComponents(getField(raw, ORDER_ITEMS_ALIASES) ?? '')) {
      const item = itemLookup.get(component.name.toLowerCase().trim());
      requestedItems.push({
        itemName: item?.name ?? component.name,
        quantity: component.quantity,
        itemId: item?.id,
        matched: Boolean(item),
      });
      if (item) requestedQuantities[item.id] = (requestedQuantities[item.id] ?? 0) + component.quantity;
    }
    const rawOrderStatus = getField(raw, ORDER_STATUS_ALIASES)?.toLowerCase().trim();
    let targetStatus: FactionOrderImportStatus = 'draft';
    if (['closed', 'abgeschlossen', 'erledigt', 'archiviert'].includes(rawOrderStatus ?? '')) {
      targetStatus = 'closed';
    } else if (['returned', 'zurückgegeben', 'zurueckgegeben', 'retoure', 'vollständig zurückgegeben', 'vollstaendig zurueckgegeben'].includes(rawOrderStatus ?? '')) {
      targetStatus = 'returned';
    } else if (['partially_returned', 'teilweise zurückgegeben', 'teilweise_zurueckgegeben', 'teilrückgabe', 'teilrueckgabe'].includes(rawOrderStatus ?? '')) {
      targetStatus = 'partially_returned';
    } else if (['picked_up', 'pickedup', 'ausgegeben', 'abgeholt', 'im_einsatz', 'in_field'].includes(rawOrderStatus ?? '')) {
      targetStatus = 'picked_up';
    } else if (['ready', 'bereit', 'gerüstet', 'geruestet'].includes(rawOrderStatus ?? '')) {
      targetStatus = 'ready';
    } else if (['submitted', 'eingereicht', 'angefordert'].includes(rawOrderStatus ?? '')) {
      targetStatus = 'submitted';
    }

    const rawReturned = getField(raw, ORDER_RETURNED_ITEMS_ALIASES);
    const returnedItems: ParsedAssemblyComponent[] = [];
    if (rawReturned) {
      for (const component of parseInlineComponents(rawReturned)) {
        const item = itemLookup.get(component.name.toLowerCase().trim());
        returnedItems.push({
          itemName: item?.name ?? component.name,
          quantity: component.quantity,
          itemId: item?.id,
          matched: Boolean(item),
        });
      }
    } else if (['returned', 'closed'].includes(targetStatus)) {
      returnedItems.push(...requestedItems);
    }

    const unmatched = requestedItems.filter((component) => !component.matched);

    let validationStatus: ParsedFactionOrderRow['status'] = 'valid';
    let statusMessage: string | undefined;
    if (!eventType) {
      validationStatus = 'error';
      statusMessage = 'Unbekannter oder fehlender Eventtyp';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(`${eventDate}T00:00:00Z`))) {
      validationStatus = 'error';
      statusMessage = 'Eventdatum muss im Format JJJJ-MM-TT angegeben werden';
    } else if (!faction) {
      validationStatus = 'error';
      statusMessage = `Fraktion "${rawFaction}" gehört nicht zum Eventtyp ${eventType}`;
    } else if (requestedItems.length === 0) {
      validationStatus = 'error';
      statusMessage = 'Eine Bestellung benötigt mindestens einen Artikel';
    } else if (unmatched.length > 0) {
      validationStatus = 'error';
      statusMessage = `Unbekannte Artikel: ${[...new Set(unmatched.map((component) => component.itemName))].join(', ')}`;
    }

    results.push({
      index: index + 1,
      data: {
        eventType: eventType ?? 'LS',
        faction: faction ?? rawFaction,
        eventDate,
        itemIds: Object.keys(requestedQuantities),
        requestedQuantities,
        assemblyIds: [],
        requestedAssemblyQuantities: {},
        notes: getField(raw, HINT_ALIASES) ?? '',
      },
      rawRow: raw,
      requestedItems,
      returnedItems: returnedItems.length > 0 ? returnedItems : undefined,
      targetStatus,
      status: validationStatus,
      statusMessage,
    });
  }
  return results;
}

/** General order rows can simulate the same submit, pickup, and return flow as the UI. */
export function parseGeneralOrdersFromCsv(rows: Record<string, string>[], items: Item[], reference: CsvReference): ParsedGeneralOrderRow[] {
  const lookup = new Map<string, Item>();
  for (const item of items) {
    lookup.set(item.id.toLowerCase(), item);
    lookup.set(item.name.toLowerCase().trim(), item);
    if (item.sku) lookup.set(item.sku.toLowerCase().trim(), item);
  }
  const resolve = (value?: string): ParsedAssemblyComponent[] => parseInlineComponents(value ?? '').map((component) => {
    const item = lookup.get(component.name.toLowerCase().trim());
    return { itemName: item?.name ?? component.name, itemId: item?.id, quantity: component.quantity, matched: Boolean(item) };
  });
  return rows.flatMap((raw, index) => {
    const rowType = getField(raw, ['type', 'typ', 'art'])?.toLowerCase().replace(/[^a-zäöü]/g, '');
    if (!['generalorder', 'allgemeinebestellung', 'allgemeinbestellung'].includes(rowType ?? '')) return [];
    const eventType = knownEventType(reference, getField(raw, EVENT_REPORT_TYPE_ALIASES));
    const eventDate = getField(raw, EVENT_DATE_ALIASES) ?? '';
    const name = getField(raw, GENERAL_ORDER_NAME_ALIASES) ?? '';
    const purpose = getField(raw, GENERAL_ORDER_PURPOSE_ALIASES) ?? '';
    const requestedItems = resolve(getField(raw, ORDER_ITEMS_ALIASES));
    const returnedItems = resolve(getField(raw, ORDER_RETURNED_ITEMS_ALIASES));
    const consumedItems = resolve(getField(raw, ORDER_CONSUMED_ITEMS_ALIASES));
    const rawStatus = getField(raw, ORDER_STATUS_ALIASES)?.toLowerCase().trim();
    let targetStatus: FactionOrderImportStatus = 'draft';
    if (['closed', 'abgeschlossen'].includes(rawStatus ?? '')) targetStatus = 'closed';
    else if (['returned', 'zurückgegeben', 'zurueckgegeben'].includes(rawStatus ?? '')) targetStatus = 'returned';
    else if (['partially_returned', 'teilrückgabe', 'teilrueckgabe'].includes(rawStatus ?? '')) targetStatus = 'partially_returned';
    else if (['picked_up', 'pickedup', 'ausgegeben', 'abgeholt'].includes(rawStatus ?? '')) targetStatus = 'picked_up';
    else if (['ready', 'bereit'].includes(rawStatus ?? '')) targetStatus = 'ready';
    else if (['submitted', 'eingereicht'].includes(rawStatus ?? '')) targetStatus = 'submitted';
    const requestedQuantities: Record<string, number> = {};
    for (const component of requestedItems) if (component.itemId) requestedQuantities[component.itemId] = (requestedQuantities[component.itemId] ?? 0) + component.quantity;
    let status: ParsedGeneralOrderRow['status'] = 'valid';
    let statusMessage: string | undefined;
    const unmatched = [...requestedItems, ...returnedItems, ...consumedItems].filter((component) => !component.matched);
    if (!name || !purpose) { status = 'error'; statusMessage = 'Name und Zweck fehlen'; }
    else if (!eventType || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(`${eventDate}T00:00:00Z`))) {
      status = 'error'; statusMessage = 'Eventtyp oder Eventdatum fehlt';
    } else if (!requestedItems.length) { status = 'error'; statusMessage = 'Bestellte Artikel fehlen'; }
    else if (unmatched.length) { status = 'error'; statusMessage = `Unbekannte Artikel: ${unmatched.map((item) => item.itemName).join(', ')}`; }
    else if (consumedItems.some((component) => !lookup.get(component.itemName.toLowerCase().trim())?.isConsumable)) {
      status = 'error'; statusMessage = 'Nur Verbrauchsmaterial kann als verbraucht erfasst werden';
    }
    else if (['returned', 'closed', 'partially_returned'].includes(targetStatus) && !returnedItems.length && !consumedItems.length) {
      status = 'error'; statusMessage = 'Rückgabeartikel oder verbrauchte Artikel fehlen';
    }
    const returnedTotals: Record<string, number> = {};
    for (const component of [...returnedItems, ...consumedItems]) if (component.itemId) returnedTotals[component.itemId] = (returnedTotals[component.itemId] ?? 0) + component.quantity;
    if (Object.entries(returnedTotals).some(([id, quantity]) => quantity > (requestedQuantities[id] ?? 0))) {
      status = 'error'; statusMessage = 'Rückgabe überschreitet bestellte Menge';
    }
    if (['returned', 'closed'].includes(targetStatus) && Object.entries(requestedQuantities).some(([id, quantity]) => (returnedTotals[id] ?? 0) !== quantity)) {
      status = 'error'; statusMessage = 'Vollständige Rückgabe benötigt Mengen für alle bestellten Artikel';
    }
    return [{ index: index + 1, rawRow: raw, data: { name, purpose, requestedQuantities }, eventType, eventDate,
      requestedItems, returnedItems, consumedItems, targetStatus, status, statusMessage }];
  });
}
