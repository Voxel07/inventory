import { type Item, type Assembly, type EventType } from '../../types';
import { type ParsedAssemblyRow, type ParsedAssemblyComponent } from '../../types/csvImport';
import type { CsvReference } from './reference';
import { getField, ASSEMBLY_COMPONENTS_ALIASES, COMPONENT_ITEM_ALIASES, ASSEMBLY_NAME_ALIASES, COMPONENT_QTY_ALIASES, parseNumber, DESCRIPTION_ALIASES, HINT_ALIASES, parseEventTypes, EVENT_TYPES_ALIASES, parseInlineComponents } from './core';

/**
 * Parses raw CSV rows into Assembly structures, supporting both inline components and multi-row format
 */
export function parseAssembliesFromCsv(
  rows: Record<string, string>[],
  items: Item[],
  existingAssemblies: Assembly[],
  reference: CsvReference,
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
          eventTypes: parseEventTypes(getField(raw, EVENT_TYPES_ALIASES), reference.eventTypes),
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
    const eventTypes = parseEventTypes(getField(raw, EVENT_TYPES_ALIASES), reference.eventTypes);

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
