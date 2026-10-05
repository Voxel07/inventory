import { type CsvImportType } from '../../types/csvImport';
import type { EventType } from '../../types';

/**
 * Robust CSV tokenizer handling quotes, escaped quotes, newlines within quotes,
 * and auto-detection of delimiters (comma, semicolon, tab, pipe).
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip BOM if present
  const content = text.replace(/^\uFEFF/, '').trim();
  if (!content) return { headers: [], rows: [] };

  // Detect delimiter from first non-empty line
  const firstLine = content.split(/\r?\n/)[0] || '';
  const delimiter = detectDelimiter(firstLine);

  const rawRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // End quote
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) rawRows.push(currentRow);
        currentRow = [];
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) rawRows.push(currentRow);
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) rawRows.push(currentRow);
  }

  if (rawRows.length === 0) return { headers: [], rows: [] };

  const headers = rawRows[0].map((h) => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const rowValues = rawRows[r];
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const headerName = headers[c];
      if (headerName) {
        rowObj[headerName] = rowValues[c] ?? '';
      }
    }
    rows.push(rowObj);
  }

  return { headers, rows };
}

export function detectDelimiter(line: string): string {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  let pipes = 0;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (c === ',') commas++;
      else if (c === ';') semicolons++;
      else if (c === '\t') tabs++;
      else if (c === '|') pipes++;
    }
  }

  // European CSVs most commonly use semicolon
  if (semicolons >= commas && semicolons >= tabs && semicolons > 0) return ';';
  if (tabs > commas && tabs > semicolons) return '\t';
  if (pipes > commas && pipes > semicolons) return '|';
  return ',';
}

export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]/g, '')
    .trim();
}

export function getField(row: Record<string, string>, aliases: string[]): string | undefined {
  const normMap = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    normMap.set(normalizeKey(k), v);
  }

  for (const alias of aliases) {
    const norm = normalizeKey(alias);
    if (normMap.has(norm)) {
      return normMap.get(norm)?.trim();
    }
  }
  return undefined;
}

export const ITEM_NAME_ALIASES = ['name', 'artikel', 'artikelname', 'bezeichnung', 'item', 'itemname', 'titel', 'title'];

export const CATEGORY_ALIASES = ['category', 'kategorie', 'kat', 'warengruppe', 'kategoriegruppe'];

export const AMOUNT_ALIASES = ['amount', 'menge', 'bestand', 'initialstock', 'anfangsbestand', 'stueck', 'stück', 'anzahl', 'quantity', 'qty'];

export const MIN_STOCK_ALIASES = ['minstock', 'mindestbestand', 'min_stock', 'mindestmenge', 'min'];

export const VALUE_ALIASES = ['value', 'wert', 'einzelwert', 'preis', 'price', 'unitvalue', 'stueckpreis', 'stückpreis'];

export const LOCATION_ALIASES = ['storagelocation', 'storage_location', 'lagerort', 'ort', 'location', 'lagerplatz', 'fach', 'regal'];

export const SUBCATEGORY_ALIASES = ['subcategory', 'unterkategorie', 'subkategorie'];

export const SUPPLIER_ALIASES = ['supplier', 'lieferant', 'hersteller', 'vendor'];

export const EVENT_TYPES_ALIASES = ['eventtypes', 'event_types', 'events', 'event', 'veranstaltungen', 'benoetigtfuerevents'];

export const CONSUMABLE_ALIASES = ['isconsumable', 'consumable', 'verbrauchsmaterial', 'verbrauch'];

export const HINT_ALIASES = ['hint', 'hinweis', 'notiz', 'notizen', 'anweisung', 'instructions'];

export const DESCRIPTION_ALIASES = ['description', 'beschreibung', 'details', 'info'];

export const CONTAINER_SIZE_ALIASES = ['containersize', 'gebindegroesse', 'gebindegröße', 'packungsgroesse'];

export const CONTAINER_COUNT_ALIASES = ['containercount', 'gebindeanzahl', 'packungsanzahl'];

export const MAINTENANCE_DAYS_ALIASES = ['maintenanceintervaldays', 'wartungsintervall', 'wartungsintervalltage'];

export const NEXT_MAINTENANCE_DUE_ALIASES = ['nextmaintenancedue', 'naechstewartung', 'nächstewartung', 'wartungfaellig', 'wartungfällig'];

export const CURRENT_OPERATING_HOURS_ALIASES = ['currentoperatinghours', 'operatinghours', 'betriebsstunden', 'laufstunden'];

export const MAINTENANCE_STATUS_ALIASES = ['maintenancestatus', 'wartungsstatus'];

export const FUEL_CONSUMPTION_ALIASES = [
  'fuelconsumptionlitersper100km',
  'fuelconsumptionl100km',
  'kraftstoffverbrauchl100km',
  'verbrauchl100km',
];

export const BATTERY_REPLACEMENT_DUE_ALIASES = [
  'batteryreplacementdue',
  'batteriewechselfaellig',
  'batteriewechselfällig',
  'akkuwechsel',
];

export const BEST_BEFORE_DATE_ALIASES = ['bestbeforedate', 'bestbefore', 'mindesthaltbarbis', 'mhd'];

export const TRACKING_MODE_ALIASES = [
  'trackingmode',
  'tracking_mode',
  'tracking',
  'trackingmodus',
  'tracking-modus',
  'erfassungsart',
  'nachverfolgung',
  'seriennummernverwaltung',
];

export const ASSET_CODE_ALIASES = [
  'assetcode',
  'assetcodes',
  'asset_code',
  'asset_codes',
  'asset',
  'assets',
  'seriennummer',
  'seriennummern',
  'serialnumber',
  'serialnumbers',
  'geraetecode',
  'gerätecode',
  'inventarnummer',
  'inventarnummern',
];

export const ASSEMBLY_NAME_ALIASES = ['name', 'baugruppenname', 'assembly', 'baugruppe', 'assemblyname', 'setname', 'set'];

export const ASSEMBLY_COMPONENTS_ALIASES = ['items', 'komponenten', 'components', 'bestandteile', 'inhalt', 'parts'];

export const COMPONENT_ITEM_ALIASES = ['componentitem', 'komponentenartikel', 'komponente', 'einzelteil', 'component'];

export const COMPONENT_QTY_ALIASES = ['quantity', 'menge', 'anzahl', 'qty', 'stueck', 'stück', 'amount'];

export const EVENT_REPORT_TYPE_ALIASES = ['eventtype', 'eventtyp', 'veranstaltungstyp'];

export const EVENT_DATE_ALIASES = ['eventdate', 'eventdatum', 'veranstaltungsdatum', 'datum', 'date'];

export const EVENT_STATUS_ALIASES = ['eventstatus', 'status'];

export const EVENT_PLANNED_ALIASES = ['planned', 'planneditems', 'geplant', 'geplantemengen', 'planmengen'];

export const EVENT_USED_ALIASES = ['used', 'useditems', 'verwendet', 'verwendetemengen', 'tatsaechlichverwendet', 'tatsächlichverwendet'];

export const ORDER_FACTION_ALIASES = ['faction', 'fraktion'];

export const ORDER_ITEMS_ALIASES = ['ordereditems', 'requesteditems', 'bestellteartikel', 'angeforderteartikel'];

export const ORDER_STATUS_ALIASES = ['orderstatus', 'bestellstatus'];

/** "latitude, longitude" with dot decimals; required once a faction order becomes ready. */
export const ORDER_PICKUP_POINT_ALIASES = ['pickuppoint', 'abholpunkt', 'abholkoordinaten'];

export const ORDER_RETURNED_ITEMS_ALIASES = [
  'returneditems',
  'rueckgabeartikel',
  'rückgabeartikel',
  'zurueckgegeben',
  'zurückgegeben',
  'rueckgabe',
  'rückgabe',
  'retoure',
];

export const GENERAL_ORDER_NAME_ALIASES = ['name', 'ordername', 'bestellname'];

export const GENERAL_ORDER_PURPOSE_ALIASES = ['purpose', 'zweck', 'beschreibung'];

export const ORDER_CONSUMED_ITEMS_ALIASES = ['consumeditems', 'verbrauchteartikel', 'verbraucht'];

export const RETURN_PERSON_ALIASES = [
  'person',
  'user',
  'benutzer',
  'mitarbeiter',
  'name',
  'rueckgebendevon',
  'rückgabedurch',
  'ausleiher',
];

export function detectCsvType(headers: string[]): CsvImportType {
  const normHeaders = headers.map(normalizeKey);

  const hasTypeCol = normHeaders.some((h) => ['type', 'typ', 'art'].includes(h));
  if (hasTypeCol) return 'combined';

  const hasAssembly = normHeaders.some((h) =>
    ['baugruppe', 'baugruppenname', 'assembly', 'assemblyname', 'komponenten', 'components', 'bestandteile'].includes(h),
  );
  if (hasAssembly) return 'assemblies';

  return 'items';
}

export function parseBoolean(val: string | undefined): boolean {
  if (!val) return false;
  const lower = val.toLowerCase().trim();
  return ['true', '1', 'ja', 'yes', 'wahr', 'y', 'j', 'x'].includes(lower);
}

export function parseNumber(val: string | undefined, defaultValue: number): number {
  if (!val) return defaultValue;
  // Handle German decimal commas e.g. "12,50" -> 12.50
  const normalized = val.replace(',', '.').replace(/[^0-9.-]/g, '');
  const num = parseFloat(normalized);
  return isNaN(num) ? defaultValue : num;
}

export function parseEventTypes(val: string | undefined, known: readonly EventType[]): EventType[] {
  if (!val) return [];
  const parts = val.split(/[,;|/]+/).map((p) => p.trim().toUpperCase());
  return parts.filter((p) => known.includes(p));
}

/**
 * Parses components string like:
 * "LED Scheinwerfer: 2; Kabeltrommel: 1" or "Generator (1), Benzin (20)"
 */
export function parseInlineComponents(str: string): { name: string; quantity: number }[] {
  // Prefer semicolons when present so commas remain valid inside item names
  // (for example "Benzingenerator 3,5 kW").
  const parts = str.split(str.includes(';') ? /[;]+/ : /[,]+/).map((p) => p.trim()).filter(Boolean);
  const result: { name: string; quantity: number }[] = [];

  for (const part of parts) {
    // Matches: "Item Name: 2", "Item Name * 2", "Item Name x 2", "Item Name (2)", "2x Item Name"
    const prefixCountMatch = part.match(/^(\d+)\s*[xX*:]\s*(.+)$/);
    if (prefixCountMatch) {
      const qty = parseInt(prefixCountMatch[1], 10);
      const name = prefixCountMatch[2].trim();
      if (name) result.push({ name, quantity: isNaN(qty) || qty < 1 ? 1 : qty });
      continue;
    }

    const suffixMatch = part.match(/^(.+?)\s*[:*xX(]?\s*(\d+)\)?$/);
    if (suffixMatch) {
      const name = suffixMatch[1].trim();
      const qty = parseInt(suffixMatch[2], 10);
      if (name) result.push({ name, quantity: isNaN(qty) || qty < 1 ? 1 : qty });
      continue;
    }

    // Default to quantity 1 if just a name is given
    result.push({ name: part, quantity: 1 });
  }

  return result;
}
