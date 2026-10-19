import { type StorageLocation, type Item, type ItemFormData } from '../../types';
import { type ParsedItemRow } from '../../types/csvImport';
import type { CsvReference } from './reference';
import { buildLocationIndex, resolveCsvLocation } from './locations';
import { holdsStock } from '../locationHierarchy';
import { parseItemLots } from './lots';
import { catalogRowKind, POSITION_ALIASES, TRACKS_RUNTIME_ALIASES, getField, ITEM_NAME_ALIASES, CATEGORY_ALIASES, AMOUNT_ALIASES, parseNumber, MIN_STOCK_ALIASES, VALUE_ALIASES, SUBCATEGORY_ALIASES, SUPPLIER_ALIASES, HINT_ALIASES, DESCRIPTION_ALIASES, parseEventTypes, EVENT_TYPES_ALIASES, TRACKING_MODE_ALIASES, ASSET_CODE_ALIASES, parseBoolean, CONSUMABLE_ALIASES, LOCATION_ALIASES, CONTAINER_SIZE_ALIASES, CONTAINER_COUNT_ALIASES, CURRENT_OPERATING_HOURS_ALIASES, FUEL_CONSUMPTION_ALIASES, BATTERY_REPLACEMENT_DUE_ALIASES, BEST_BEFORE_DATE_ALIASES } from './core';

export function parseTrackingMode(val: string | undefined): 'bulk' | 'serialized' | 'lot_tracked' | undefined {
  if (!val) return undefined;
  const lower = val.toLowerCase().trim();
  if (['serialized', 'seriell', 'einzeln', 'einzelgerät', 'einzelgeraet', 'seriennummer', 'serial'].includes(lower)) {
    return 'serialized';
  }
  if (['lot_tracked', 'lot', 'charge', 'chargen', 'chargenverfolgt'].includes(lower)) {
    return 'lot_tracked';
  }
  if (['bulk', 'masse', 'mengenbasiert', 'menge'].includes(lower)) {
    return 'bulk';
  }
  return undefined;
}

export function parseAssetCodes(val: string | undefined): string[] {
  if (!val) return [];
  return val
    .split(/[,|\r\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parses raw CSV rows into validated Item structures
 */
export function parseItemsFromCsv(
  rows: Record<string, string>[],
  storageLocations: StorageLocation[],
  existingItems: Item[],
  reference: CsvReference,
): ParsedItemRow[] {
  const results: ParsedItemRow[] = [];
  const locationIndex = buildLocationIndex(storageLocations);

  const existingMap = new Map<string, Item>();
  for (const item of existingItems) {
    existingMap.set(item.name.toLowerCase().trim(), item);
  }

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    if (catalogRowKind(raw) !== 'item') continue;

    const name = getField(raw, ITEM_NAME_ALIASES);
    if (!name) {
      results.push({
        index: i + 1,
        data: {
          name: '',
          category: '',
          minStock: 5,
          value: 0,
          storageLocation: '',
        },
        rawRow: raw,
        status: 'error',
        statusMessage: 'Fehlender Artikelname (Name is required)',
        isExisting: false,
      });
      continue;
    }

    const category = getField(raw, CATEGORY_ALIASES) || 'Allgemein';
    const amountStr = getField(raw, AMOUNT_ALIASES);
    const minStock = Math.max(0, Math.round(parseNumber(getField(raw, MIN_STOCK_ALIASES), 5)));
    const value = Math.max(0, parseNumber(getField(raw, VALUE_ALIASES), 0));
    const subcategory = getField(raw, SUBCATEGORY_ALIASES);
    const supplier = getField(raw, SUPPLIER_ALIASES);
    const hint = getField(raw, HINT_ALIASES) || getField(raw, DESCRIPTION_ALIASES);
    const eventTypes = parseEventTypes(getField(raw, EVENT_TYPES_ALIASES), reference.eventTypes);

    const rawTrackingMode = parseTrackingMode(getField(raw, TRACKING_MODE_ALIASES));
    const assetCodes = parseAssetCodes(getField(raw, ASSET_CODE_ALIASES));
    let lots: ParsedItemRow['lots'];
    let lotError: string | undefined;
    const lotsInput = getField(raw, ['lots', 'chargen']);
    try {
      lots = parseItemLots(lotsInput);
      if (lots && rawTrackingMode && rawTrackingMode !== 'lot_tracked') throw new Error('Lots benötigt TrackingMode lot_tracked');
      if (lots && assetCodes.length) throw new Error('Lots und AssetCodes können nicht kombiniert werden');
    } catch (error) {
      lotError = error instanceof Error ? error.message : String(error);
    }
    const trackingMode = rawTrackingMode || (lotsInput ? 'lot_tracked' : assetCodes.length > 0 ? 'serialized' : undefined);

    let amount = amountStr ? Math.max(0, Math.round(parseNumber(amountStr, 0))) : 0;
    if (amount === 0 && assetCodes.length > 0) {
      amount = assetCodes.length;
    }
    if (lots) {
      const quantity = lots.reduce((total, lot) => total + lot.quantity, 0);
      if (!Number.isSafeInteger(quantity)) lotError = 'Die Gesamtmenge der Chargen ist zu groß';
      if (amountStr && parseNumber(amountStr, NaN) !== quantity) lotError = 'Bestand/Menge muss der Summe der Chargenmengen entsprechen';
      amount = quantity;
    }

    const isConsumable = trackingMode !== 'serialized' && parseBoolean(getField(raw, CONSUMABLE_ALIASES));

    const locInput = getField(raw, LOCATION_ALIASES);
    let storageLocationId = '';
    let storageLocationName: string | undefined = undefined;
    let storageLocationPath: string[] | undefined = undefined;
    let locationWarning: string | undefined = undefined;
    let locationError: string | undefined = undefined;

    if (locInput) {
      const match = resolveCsvLocation(locInput, locationIndex);
      if (match.kind === 'found' && !holdsStock(match.location)) {
        storageLocationName = match.location.name;
        locationError = `"${match.location.name}" ist ein Standort ohne Bestand – Bereich oder Lagerplatz angeben (z. B. ${match.location.name} / Lager / Regal 1)`;
      } else if (match.kind === 'found') {
        storageLocationId = match.location.id;
        storageLocationName = match.location.fullCode ? `${match.location.fullCode} · ${match.location.hierarchyPath ?? match.location.name}` : match.location.name;
      } else if (match.kind === 'ambiguous') {
        storageLocationName = match.name;
        locationError = `Lagerort "${match.name}" ist mehrdeutig – Code (z. B. BH-L-R3) oder Pfad (Betriebshof / Lager / Regal 3) angeben`;
      } else if (match.segments.length < 2) {
        storageLocationName = match.segments.join(' / ');
        locationError = `Lagerort "${storageLocationName}" unbekannt – neue Lagerorte brauchen mindestens Standort / Bereich (z. B. Betriebshof / Lager)`;
      } else {
        storageLocationName = match.segments.join(' / ');
        storageLocationPath = match.segments;
        locationWarning = `Lagerort "${storageLocationName}" existiert nicht und wird neu angelegt`;
      }
    }

    const containerSizeStr = getField(raw, CONTAINER_SIZE_ALIASES);
    const containerCountStr = getField(raw, CONTAINER_COUNT_ALIASES);
    const currentOperatingHoursStr = getField(raw, CURRENT_OPERATING_HOURS_ALIASES);
    const fuelConsumptionStr = getField(raw, FUEL_CONSUMPTION_ALIASES);
    const batteryReplacementDue = getField(raw, BATTERY_REPLACEMENT_DUE_ALIASES) || undefined;
    const bestBeforeDate = getField(raw, BEST_BEFORE_DATE_ALIASES) || undefined;

    const data: ItemFormData = {
      name,
      category,
      amount,
      minStock,
      value,
      storageLocation: storageLocationId,
      positionDetails: getField(raw, POSITION_ALIASES) || undefined,
      subcategory,
      supplier,
      hint,
      trackingMode: trackingMode || 'bulk',
      inventoryRole: isConsumable ? 'consumable' : 'returnable',
      eventTypes,
      containerSize: containerSizeStr ? parseNumber(containerSizeStr, 0) : undefined,
      containerCount: containerCountStr ? Math.round(parseNumber(containerCountStr, 0)) : undefined,
      currentOperatingHours: currentOperatingHoursStr ? parseNumber(currentOperatingHoursStr, 0) : undefined,
      // A meter column implies runtime tracking unless the row says otherwise.
      tracksRuntime: getField(raw, TRACKS_RUNTIME_ALIASES) ? parseBoolean(getField(raw, TRACKS_RUNTIME_ALIASES)) : Boolean(currentOperatingHoursStr),
      fuelConsumptionLitersPer100Km: fuelConsumptionStr ? parseNumber(fuelConsumptionStr, 0) : undefined,
      batteryReplacementDue,
      bestBeforeDate,
    };

    const existing = existingMap.get(name.toLowerCase().trim());
    let status: ParsedItemRow['status'] = 'valid';
    let statusMessage: string | undefined = undefined;

    if (lotError || locationError) {
      status = 'error';
      statusMessage = lotError || locationError;
    } else if (existing) {
      status = 'duplicate';
      statusMessage = `Artikel "${name}" existiert bereits (kann übersprungen oder aktualisiert werden)`;
    } else if (locationWarning) {
      status = 'warning';
      statusMessage = locationWarning;
    }

    results.push({
      index: i + 1,
      data,
      rawRow: raw,
      storageLocationName,
      storageLocationId,
      storageLocationPath,
      assetCodes: assetCodes.length > 0 ? assetCodes : undefined,
      lots,
      status,
      statusMessage,
      isExisting: Boolean(existing),
      existingId: existing?.id,
    });
  }

  return results;
}
