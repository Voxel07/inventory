import { type StorageLocation, type Item, type ItemFormData } from '../../types';
import { type ParsedItemRow } from '../../types/csvImport';
import type { CsvReference } from './reference';
import { getField, ITEM_NAME_ALIASES, CATEGORY_ALIASES, AMOUNT_ALIASES, parseNumber, MIN_STOCK_ALIASES, VALUE_ALIASES, SUBCATEGORY_ALIASES, SUPPLIER_ALIASES, HINT_ALIASES, DESCRIPTION_ALIASES, parseEventTypes, EVENT_TYPES_ALIASES, TRACKING_MODE_ALIASES, ASSET_CODE_ALIASES, parseBoolean, CONSUMABLE_ALIASES, LOCATION_ALIASES, CONTAINER_SIZE_ALIASES, CONTAINER_COUNT_ALIASES, MAINTENANCE_DAYS_ALIASES, NEXT_MAINTENANCE_DUE_ALIASES, CURRENT_OPERATING_HOURS_ALIASES, MAINTENANCE_STATUS_ALIASES, FUEL_CONSUMPTION_ALIASES, BATTERY_REPLACEMENT_DUE_ALIASES, BEST_BEFORE_DATE_ALIASES } from './core';

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

export function parseMaintenanceStatus(
  val: string | undefined,
): 'certified' | 'due_soon' | 'overdue' | 'in_service' | undefined {
  if (!val) return undefined;
  const lower = val.toLowerCase().trim();
  if (['certified', 'freigegeben', 'geprüft', 'geprueft'].includes(lower)) return 'certified';
  if (['due_soon', 'bald_fällig', 'bald_faellig', 'bald fällig', 'bald faellig'].includes(lower)) return 'due_soon';
  if (['overdue', 'überfällig', 'ueberfaellig'].includes(lower)) return 'overdue';
  if (['in_service', 'in wartung', 'wartung'].includes(lower)) return 'in_service';
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
  const locMap = new Map<string, StorageLocation>();
  for (const loc of storageLocations) {
    locMap.set(loc.name.toLowerCase().trim(), loc);
    locMap.set(loc.id.toLowerCase().trim(), loc);
  }

  const existingMap = new Map<string, Item>();
  for (const item of existingItems) {
    existingMap.set(item.name.toLowerCase().trim(), item);
  }

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const typeField = getField(raw, ['type', 'typ']);
    if (typeField && !['item', 'artikel', 'part'].includes(typeField.toLowerCase().trim())) {
      continue; // Skip non-item rows in combined files
    }

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
    const trackingMode = rawTrackingMode || (assetCodes.length > 0 ? 'serialized' : undefined);

    let amount = amountStr ? Math.max(0, Math.round(parseNumber(amountStr, 0))) : 0;
    if (amount === 0 && assetCodes.length > 0) {
      amount = assetCodes.length;
    }

    const rawIsConsumable = parseBoolean(getField(raw, CONSUMABLE_ALIASES));
    const isConsumable = trackingMode === 'serialized' ? false : rawIsConsumable;

    const locInput = getField(raw, LOCATION_ALIASES);
    let storageLocationId = '';
    let storageLocationName: string | undefined = undefined;
    let locationWarning: string | undefined = undefined;

    if (locInput) {
      const match = locMap.get(locInput.toLowerCase().trim());
      if (match) {
        storageLocationId = match.id;
        storageLocationName = match.name;
      } else {
        storageLocationName = locInput.trim();
        locationWarning = `Lagerort "${storageLocationName}" existiert nicht und wird neu angelegt`;
      }
    }

    const containerSizeStr = getField(raw, CONTAINER_SIZE_ALIASES);
    const containerCountStr = getField(raw, CONTAINER_COUNT_ALIASES);
    const maintenanceDaysStr = getField(raw, MAINTENANCE_DAYS_ALIASES);
    const nextMaintenanceDue = getField(raw, NEXT_MAINTENANCE_DUE_ALIASES) || undefined;
    const currentOperatingHoursStr = getField(raw, CURRENT_OPERATING_HOURS_ALIASES);
    const maintenanceStatus = parseMaintenanceStatus(getField(raw, MAINTENANCE_STATUS_ALIASES));
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
      subcategory,
      supplier,
      hint,
      isConsumable,
      trackingMode: trackingMode || 'bulk',
      inventoryRole: trackingMode === 'serialized' ? 'returnable' : (isConsumable ? 'consumable' : 'returnable'),
      eventTypes,
      containerSize: containerSizeStr ? parseNumber(containerSizeStr, 0) : undefined,
      containerCount: containerCountStr ? Math.round(parseNumber(containerCountStr, 0)) : undefined,
      maintenanceIntervalDays: maintenanceDaysStr ? Math.round(parseNumber(maintenanceDaysStr, 0)) : undefined,
      nextMaintenanceDue,
      currentOperatingHours: currentOperatingHoursStr ? parseNumber(currentOperatingHoursStr, 0) : undefined,
      maintenanceStatus,
      fuelConsumptionLitersPer100Km: fuelConsumptionStr ? parseNumber(fuelConsumptionStr, 0) : undefined,
      batteryReplacementDue,
      bestBeforeDate,
    };

    const existing = existingMap.get(name.toLowerCase().trim());
    let status: ParsedItemRow['status'] = 'valid';
    let statusMessage: string | undefined = undefined;

    if (existing) {
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
      assetCodes: assetCodes.length > 0 ? assetCodes : undefined,
      status,
      statusMessage,
      isExisting: Boolean(existing),
      existingId: existing?.id,
    });
  }

  return results;
}
