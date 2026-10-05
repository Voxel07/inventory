import { type Item, type StorageLocation } from '../../types';
import { knownEventType, knownFaction, type CsvReference } from './reference';
import { type ParsedReturnRow, type ParsedCheckoutRow } from '../../types/csvImport';
import { getField, ITEM_NAME_ALIASES, AMOUNT_ALIASES, COMPONENT_QTY_ALIASES, parseNumber, ASSET_CODE_ALIASES, LOCATION_ALIASES, EVENT_REPORT_TYPE_ALIASES, EVENT_TYPES_ALIASES, ORDER_FACTION_ALIASES, RETURN_PERSON_ALIASES, EVENT_DATE_ALIASES, HINT_ALIASES, DESCRIPTION_ALIASES } from './core';
import { parseAssetCodes } from './items';

/** Parses standalone return / checkin rows from a combined CSV. */
export function parseReturnsFromCsv(
  rows: Record<string, string>[],
  items: Item[],
  storageLocations: StorageLocation[],
  reference: CsvReference,
): ParsedReturnRow[] {
  const itemLookup = new Map<string, Item>();
  for (const item of items) {
    itemLookup.set(item.name.toLowerCase().trim(), item);
    itemLookup.set(item.id.toLowerCase().trim(), item);
    if (item.sku) itemLookup.set(item.sku.toLowerCase().trim(), item);
  }

  const locMap = new Map<string, StorageLocation>();
  for (const loc of storageLocations) {
    locMap.set(loc.name.toLowerCase().trim(), loc);
    locMap.set(loc.id.toLowerCase().trim(), loc);
  }

  const results: ParsedReturnRow[] = [];
  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index];
    const rowType = getField(raw, ['type', 'typ', 'art'])?.toLowerCase().trim() || '';
    const normRowType = rowType.replace(/ü/g, 'ue').replace(/[^a-z]/g, '');
    const isReturn =
      ['return', 'rückgabe', 'rueckgabe', 'retoure', 'checkin', 'rücknahme', 'ruecknahme'].includes(rowType)
      || ['return', 'rueckgabe', 'retoure', 'checkin', 'ruecknahme'].includes(normRowType)
      || (rowType.startsWith('r') && rowType.endsWith('ckgabe'));
    if (!isReturn) continue;

    const itemName = getField(raw, ITEM_NAME_ALIASES) || '';
    const item = itemLookup.get(itemName.toLowerCase().trim());
    const rawQty = getField(raw, AMOUNT_ALIASES) || getField(raw, COMPONENT_QTY_ALIASES);
    const quantity = Math.max(1, Math.round(parseNumber(rawQty, 1)));
    const assetCodes = parseAssetCodes(getField(raw, ASSET_CODE_ALIASES));
    const assetCode = assetCodes[0] || undefined;

    const rawLoc = getField(raw, LOCATION_ALIASES);
    const loc = rawLoc ? locMap.get(rawLoc.toLowerCase().trim()) : undefined;

    const rawEventType = getField(raw, EVENT_REPORT_TYPE_ALIASES) || getField(raw, EVENT_TYPES_ALIASES);
    const eventType = knownEventType(reference, rawEventType);

    const faction = getField(raw, ORDER_FACTION_ALIASES);
    const person = getField(raw, RETURN_PERSON_ALIASES);
    const date = getField(raw, EVENT_DATE_ALIASES);
    const generalOrderName = getField(raw, ['generalorder', 'generalordername', 'allgemeinebestellung', 'bestellname', 'ordername']);
    const notes = getField(raw, HINT_ALIASES) || getField(raw, DESCRIPTION_ALIASES) || '';

    const rawStatus = getField(raw, ['status', 'returnstatus', 'rueckgabestatus', 'rückgabestatus'])?.toLowerCase().trim();
    let targetStatus: 'pending' | 'accepted' | 'rejected' = 'accepted';
    if (['rejected', 'abgelehnt'].includes(rawStatus ?? '')) {
      targetStatus = 'rejected';
    } else if (['pending', 'offen', 'ausstehend', 'in_pruefung'].includes(rawStatus ?? '')) {
      targetStatus = 'pending';
    }

    let validationStatus: ParsedReturnRow['status'] = 'valid';
    let statusMessage: string | undefined;

    if (!itemName) {
      validationStatus = 'error';
      statusMessage = 'Fehlender Artikelname für Rückgabe';
    } else if (!item) {
      validationStatus = 'error';
      statusMessage = `Artikel "${itemName}" nicht gefunden`;
    } else if (item.trackingMode === 'serialized' && !generalOrderName && assetCodes.length !== quantity) {
      validationStatus = 'error';
      statusMessage = 'AssetCodes müssen der Menge entsprechen';
    }

    results.push({
      index: index + 1,
      rawRow: raw,
      itemName: item?.name || itemName,
      itemId: item?.id,
      quantity,
      assetCode,
      assetCodes,
      storageLocationName: loc?.name || rawLoc,
      storageLocationId: loc?.id,
      eventType,
      faction,
      person,
      date,
      generalOrderName,
      notes,
      targetStatus,
      status: validationStatus,
      statusMessage,
    });
  }

  return results;
}

/** Explicit checkout rows make imported sample stock usable for return flows. */
export function parseCheckoutsFromCsv(rows: Record<string, string>[], items: Item[], reference: CsvReference): ParsedCheckoutRow[] {
  const names = new Set(items.map((item) => item.name.toLowerCase().trim()));
  return rows.flatMap((raw, index) => {
    const type = getField(raw, ['type', 'typ', 'art'])?.toLowerCase().trim();
    if (!['checkout', 'ausleihe', 'ausgabe'].includes(type ?? '')) return [];
    const itemName = getField(raw, ITEM_NAME_ALIASES) ?? '';
    const quantity = Math.round(parseNumber(getField(raw, AMOUNT_ALIASES), 1));
    const assetCodes = parseAssetCodes(getField(raw, ASSET_CODE_ALIASES));
    const event = getField(raw, EVENT_REPORT_TYPE_ALIASES)?.toUpperCase().trim();
    const eventType = knownEventType(reference, event);
    const faction = getField(raw, ORDER_FACTION_ALIASES);
    const notes = getField(raw, HINT_ALIASES) ?? '';
    const statusMessage = !names.has(itemName.toLowerCase().trim()) ? `Artikel "${itemName}" nicht gefunden`
      : quantity < 1 ? 'Menge muss mindestens 1 sein'
      : !eventType || !faction ? 'Eventtyp und Fraktion sind erforderlich'
      : !knownFaction(reference, eventType, faction) ? `Fraktion "${faction}" gehört nicht zum Eventtyp ${eventType}`
      : assetCodes.length > 0 && assetCodes.length !== quantity ? 'AssetCodes müssen der Menge entsprechen'
      : undefined;
    return [{ index: index + 1, itemName, quantity, assetCodes, eventType, faction, notes,
      status: statusMessage ? 'error' as const : 'valid' as const, statusMessage }];
  });
}
