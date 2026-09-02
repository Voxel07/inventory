import { EVENT_TYPES, type Assembly, type AssemblyFormData, type EventType, type Item, type ItemFormData, type StorageLocation } from '../types';

export interface ParsedItemRow {
  index: number;
  data: ItemFormData;
  rawRow: Record<string, string>;
  storageLocationName?: string;
  storageLocationId?: string;
  status: 'valid' | 'warning' | 'error' | 'duplicate';
  statusMessage?: string;
  isExisting: boolean;
  existingId?: string;
}

export interface ParsedAssemblyComponent {
  itemName: string;
  quantity: number;
  itemId?: string;
  matched: boolean;
}

export interface ParsedAssemblyRow {
  index: number;
  data: AssemblyFormData;
  rawRow: Record<string, string>;
  components: ParsedAssemblyComponent[];
  status: 'valid' | 'warning' | 'error' | 'duplicate';
  statusMessage?: string;
  isExisting: boolean;
  existingId?: string;
}

export type CsvImportType = 'items' | 'assemblies' | 'combined';

/**
 * Robust CSV tokenizer handling quotes, escaped quotes, newlines within quotes,
 * and auto-detection of delimiters (comma, semicolon, tab, pipe).
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip BOM if present
  let content = text.replace(/^\uFEFF/, '').trim();
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

function detectDelimiter(line: string): string {
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

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]/g, '')
    .trim();
}

function getField(row: Record<string, string>, aliases: string[]): string | undefined {
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

const ITEM_NAME_ALIASES = ['name', 'artikel', 'artikelname', 'bezeichnung', 'item', 'itemname', 'titel', 'title'];
const CATEGORY_ALIASES = ['category', 'kategorie', 'kat', 'warengruppe', 'kategoriegruppe'];
const AMOUNT_ALIASES = ['amount', 'menge', 'bestand', 'initialstock', 'anfangsbestand', 'stueck', 'stück', 'anzahl', 'quantity', 'qty'];
const MIN_STOCK_ALIASES = ['minstock', 'mindestbestand', 'min_stock', 'mindestmenge', 'min'];
const VALUE_ALIASES = ['value', 'wert', 'einzelwert', 'preis', 'price', 'unitvalue', 'stueckpreis', 'stückpreis'];
const LOCATION_ALIASES = ['storagelocation', 'storage_location', 'lagerort', 'ort', 'location', 'lagerplatz', 'fach', 'regal'];
const SUBCATEGORY_ALIASES = ['subcategory', 'unterkategorie', 'subkategorie'];
const SUPPLIER_ALIASES = ['supplier', 'lieferant', 'hersteller', 'vendor'];
const EVENT_TYPES_ALIASES = ['eventtypes', 'event_types', 'events', 'event', 'veranstaltungen', 'benoetigtfuerevents'];
const CONSUMABLE_ALIASES = ['isconsumable', 'consumable', 'verbrauchsmaterial', 'verbrauch'];
const HINT_ALIASES = ['hint', 'hinweis', 'notiz', 'notizen', 'anweisung', 'instructions'];
const DESCRIPTION_ALIASES = ['description', 'beschreibung', 'details', 'info'];
const CONTAINER_SIZE_ALIASES = ['containersize', 'gebindegroesse', 'gebindegröße', 'packungsgroesse'];
const CONTAINER_COUNT_ALIASES = ['containercount', 'gebindeanzahl', 'packungsanzahl'];
const MAINTENANCE_DAYS_ALIASES = ['maintenanceintervaldays', 'wartungsintervall', 'wartungsintervalltage'];

const ASSEMBLY_NAME_ALIASES = ['name', 'baugruppenname', 'assembly', 'baugruppe', 'assemblyname', 'setname', 'set'];
const ASSEMBLY_COMPONENTS_ALIASES = ['items', 'komponenten', 'components', 'bestandteile', 'inhalt', 'parts'];
const COMPONENT_ITEM_ALIASES = ['componentitem', 'komponentenartikel', 'komponente', 'einzelteil', 'component'];
const COMPONENT_QTY_ALIASES = ['quantity', 'menge', 'anzahl', 'qty', 'stueck', 'stück', 'amount'];

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

function parseBoolean(val: string | undefined): boolean {
  if (!val) return false;
  const lower = val.toLowerCase().trim();
  return ['true', '1', 'ja', 'yes', 'wahr', 'y', 'j', 'x'].includes(lower);
}

function parseNumber(val: string | undefined, defaultValue: number): number {
  if (!val) return defaultValue;
  // Handle German decimal commas e.g. "12,50" -> 12.50
  const normalized = val.replace(',', '.').replace(/[^0-9.-]/g, '');
  const num = parseFloat(normalized);
  return isNaN(num) ? defaultValue : num;
}

function parseEventTypes(val: string | undefined): EventType[] {
  if (!val) return [];
  const parts = val.split(/[,;|/]+/).map((p) => p.trim().toUpperCase());
  return parts.filter((p): p is EventType => (EVENT_TYPES as readonly string[]).includes(p));
}

/**
 * Parses raw CSV rows into validated Item structures
 */
export function parseItemsFromCsv(
  rows: Record<string, string>[],
  storageLocations: StorageLocation[],
  existingItems: Item[],
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
    const amount = amountStr ? Math.max(0, Math.round(parseNumber(amountStr, 0))) : 0;
    const minStock = Math.max(0, Math.round(parseNumber(getField(raw, MIN_STOCK_ALIASES), 5)));
    const value = Math.max(0, parseNumber(getField(raw, VALUE_ALIASES), 0));
    const subcategory = getField(raw, SUBCATEGORY_ALIASES);
    const supplier = getField(raw, SUPPLIER_ALIASES);
    const hint = getField(raw, HINT_ALIASES) || getField(raw, DESCRIPTION_ALIASES);
    const isConsumable = parseBoolean(getField(raw, CONSUMABLE_ALIASES));
    const eventTypes = parseEventTypes(getField(raw, EVENT_TYPES_ALIASES));

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
      eventTypes,
      containerSize: containerSizeStr ? parseNumber(containerSizeStr, 0) : undefined,
      containerCount: containerCountStr ? Math.round(parseNumber(containerCountStr, 0)) : undefined,
      maintenanceIntervalDays: maintenanceDaysStr ? Math.round(parseNumber(maintenanceDaysStr, 0)) : undefined,
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
      status,
      statusMessage,
      isExisting: Boolean(existing),
      existingId: existing?.id,
    });
  }

  return results;
}

/**
 * Parses components string like:
 * "LED Scheinwerfer: 2; Kabeltrommel: 1" or "Generator (1), Benzin (20)"
 */
function parseInlineComponents(str: string): { name: string; quantity: number }[] {
  const parts = str.split(/[;,]+/).map((p) => p.trim()).filter(Boolean);
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

/**
 * Parses raw CSV rows into Assembly structures, supporting both inline components and multi-row format
 */
export function parseAssembliesFromCsv(
  rows: Record<string, string>[],
  items: Item[],
  existingAssemblies: Assembly[],
): ParsedAssemblyRow[] {
  const itemLookup = new Map<string, Item>();
  for (const item of items) {
    itemLookup.set(item.name.toLowerCase().trim(), item);
    itemLookup.set(item.id.toLowerCase().trim(), item);
    if (item.sku) itemLookup.set(item.sku.toLowerCase().trim(), item);
  }

  const existingMap = new Map<string, Assembly>();
  for (const assem of existingAssemblies) {
    existingMap.set(assem.name.toLowerCase().trim(), assem);
  }

  // Check if this CSV is multi-row format: has both assembly name and single component columns
  const hasInlineComponentsCol = rows.some((r) => Boolean(getField(r, ASSEMBLY_COMPONENTS_ALIASES)));
  const hasSingleComponentCol = !hasInlineComponentsCol && rows.some((r) => Boolean(getField(r, COMPONENT_ITEM_ALIASES)));

  if (hasSingleComponentCol && !hasInlineComponentsCol) {
    // Multi-row grouping by assembly name
    const grouped = new Map<
      string,
      {
        index: number;
        description: string;
        hint: string;
        eventTypes: EventType[];
        rawRow: Record<string, string>;
        components: { name: string; quantity: number }[];
      }
    >();

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const typeField = getField(raw, ['type', 'typ']);
      if (typeField && !['assembly', 'baugruppe', 'set'].includes(typeField.toLowerCase().trim())) {
        continue;
      }

      const name = getField(raw, ASSEMBLY_NAME_ALIASES);
      if (!name) continue;

      const compName = getField(raw, COMPONENT_ITEM_ALIASES);
      const compQtyStr = getField(raw, COMPONENT_QTY_ALIASES);
      const qty = compQtyStr ? Math.max(1, Math.round(parseNumber(compQtyStr, 1))) : 1;

      if (!grouped.has(name)) {
        grouped.set(name, {
          index: i + 1,
          description: getField(raw, DESCRIPTION_ALIASES) || '',
          hint: getField(raw, HINT_ALIASES) || '',
          eventTypes: parseEventTypes(getField(raw, EVENT_TYPES_ALIASES)),
          rawRow: raw,
          components: [],
        });
      }

      if (compName) {
        grouped.get(name)!.components.push({ name: compName, quantity: qty });
      }
    }

    const results: ParsedAssemblyRow[] = [];
    for (const [name, g] of grouped.entries()) {
      const parsedComps: ParsedAssemblyComponent[] = [];
      const itemIds: string[] = [];
      const itemQuantities: Record<string, number> = {};

      for (const comp of g.components) {
        const matchedItem = itemLookup.get(comp.name.toLowerCase().trim());
        if (matchedItem) {
          parsedComps.push({ itemName: matchedItem.name, quantity: comp.quantity, itemId: matchedItem.id, matched: true });
          itemIds.push(matchedItem.id);
          itemQuantities[matchedItem.id] = (itemQuantities[matchedItem.id] ?? 0) + comp.quantity;
        } else {
          parsedComps.push({ itemName: comp.name, quantity: comp.quantity, matched: false });
        }
      }

      const existing = existingMap.get(name.toLowerCase().trim());
      let status: ParsedAssemblyRow['status'] = 'valid';
      let statusMessage: string | undefined = undefined;

      if (existing) {
        status = 'duplicate';
        statusMessage = `Baugruppe "${name}" existiert bereits`;
      } else if (parsedComps.length === 0) {
        status = 'error';
        statusMessage = 'Keine Komponenten definiert';
      } else if (parsedComps.some((c) => !c.matched)) {
        const missing = parsedComps.filter((c) => !c.matched).map((c) => c.itemName).join(', ');
        status = 'error';
        statusMessage = `Unbekannte Artikel: ${missing}`;
      }

      results.push({
        index: g.index,
        data: {
          name,
          description: g.description,
          hint: g.hint,
          eventTypes: g.eventTypes,
          itemIds: [...new Set(itemIds)],
          itemQuantities,
        },
        rawRow: g.rawRow,
        components: parsedComps,
        status,
        statusMessage,
        isExisting: Boolean(existing),
        existingId: existing?.id,
      });
    }

    return results;
  }

  // Single-row format: each row is one assembly with components in an "items/komponenten" column
  const results: ParsedAssemblyRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const typeField = getField(raw, ['type', 'typ']);
    if (typeField && !['assembly', 'baugruppe', 'set'].includes(typeField.toLowerCase().trim())) {
      continue;
    }

    const name = getField(raw, ASSEMBLY_NAME_ALIASES);
    if (!name) {
      results.push({
        index: i + 1,
        data: { name: '', description: '', hint: '', eventTypes: [], itemIds: [], itemQuantities: {} },
        rawRow: raw,
        components: [],
        status: 'error',
        statusMessage: 'Baugruppenname fehlt',
        isExisting: false,
      });
      continue;
    }

    const description = getField(raw, DESCRIPTION_ALIASES) || '';
    const hint = getField(raw, HINT_ALIASES) || '';
    const eventTypes = parseEventTypes(getField(raw, EVENT_TYPES_ALIASES));

    const componentsStr = getField(raw, ASSEMBLY_COMPONENTS_ALIASES) || '';
    const rawComps = parseInlineComponents(componentsStr);

    const parsedComps: ParsedAssemblyComponent[] = [];
    const itemIds: string[] = [];
    const itemQuantities: Record<string, number> = {};

    for (const comp of rawComps) {
      const matchedItem = itemLookup.get(comp.name.toLowerCase().trim());
      if (matchedItem) {
        parsedComps.push({ itemName: matchedItem.name, quantity: comp.quantity, itemId: matchedItem.id, matched: true });
        itemIds.push(matchedItem.id);
        itemQuantities[matchedItem.id] = (itemQuantities[matchedItem.id] ?? 0) + comp.quantity;
      } else {
        parsedComps.push({ itemName: comp.name, quantity: comp.quantity, matched: false });
      }
    }

    const existing = existingMap.get(name.toLowerCase().trim());
    let status: ParsedAssemblyRow['status'] = 'valid';
    let statusMessage: string | undefined = undefined;

    if (existing) {
      status = 'duplicate';
      statusMessage = `Baugruppe "${name}" existiert bereits`;
    } else if (parsedComps.length === 0) {
      status = 'error';
      statusMessage = 'Keine Komponenten angegeben (Format: "Artikel 1: 2; Artikel 2: 1")';
    } else if (parsedComps.some((c) => !c.matched)) {
      const missing = parsedComps.filter((c) => !c.matched).map((c) => c.itemName).join(', ');
      status = 'error';
      statusMessage = `Nicht gefundene Artikel: ${missing}`;
    }

    results.push({
      index: i + 1,
      data: {
        name,
        description,
        hint,
        eventTypes,
        itemIds: [...new Set(itemIds)],
        itemQuantities,
      },
      rawRow: raw,
      components: parsedComps,
      status,
      statusMessage,
      isExisting: Boolean(existing),
      existingId: existing?.id,
    });
  }

  return results;
}

/**
 * Generates sample CSV files for download
 */
export function generateSampleItemsCsv(): string {
  return [
    'Artikel;Kategorie;Bestand;Mindestbestand;Einzelwert;Lagerort;Unterkategorie;Lieferant;Verbrauchsmaterial;Events;Hinweis',
    'Stromerzeuger 2kW;Elektro;4;2;349,00;Regal A1;Generatoren;Honda;Nein;DE,TNO;Vor Erstinbetriebnahme Ölstand prüfen',
    'Kabeltrommel 50m;Elektro;10;5;59,95;Regal A2;Kabel;Brennenstuhl;Nein;DE,TNO,LS;Nach Gebrauch trocken aufrollen',
    'Gaffa Tape 50m schwarz;Verbrauchsmaterial;24;10;8,50;Kiste B;Klebeband;Tesa;Ja;DE,TNO,LS,M24;Rückstandslos ablösbar',
    'LED Flutlicht 100W;Beleuchtung;8;4;45,00;Regal C1;Scheinwerfer;Osram;Nein;DE;Inkl. Schutzkontaktstecker',
  ].join('\r\n');
}

export function generateSampleAssembliesCsv(): string {
  return [
    'Baugruppe;Beschreibung;Komponenten;Events;Hinweis',
    'Camp-Beleuchtungsset;Vollständiges Set für Torbeleuchtung;"LED Flutlicht 100W: 2; Kabeltrommel 50m: 1; Gaffa Tape 50m schwarz: 1";DE,TNO;Immer vor Nässe geschützt aufbauen',
    'Notstrom-Station;Mobile Energieversorgung für Außenposten;"Stromerzeuger 2kW: 1; Kabeltrommel 50m: 2";DE,LS;Nur im Freien betreiben',
  ].join('\r\n');
}

export function generateSampleCombinedCsv(): string {
  return [
    'Typ;Name;Kategorie;Menge;Mindestbestand;Einzelwert;Lagerort;Komponenten;Events;Hinweis',
    'Artikel;Zeltgestänge 4x4m;Infrastruktur;6;2;120,00;Lager Zelt; ;DE,TNO;Auf Vollständigkeit prüfen',
    'Artikel;Zeltplane 4x4m;Infrastruktur;6;2;180,00;Lager Zelt; ;DE,TNO;Trocken lagern',
    'Artikel;Heringe 30cm (10er Set);Infrastruktur;12;4;15,00;Lager Zelt; ;DE,TNO,LS;Immer nachzählen',
    'Baugruppe;SG-Zelt komplett;Zelte; ; ; ; ;"Zeltgestänge 4x4m: 1; Zeltplane 4x4m: 1; Heringe 30cm (10er Set): 2";DE,TNO;Komplettes Zelt mit Heringen',
  ].join('\r\n');
}
