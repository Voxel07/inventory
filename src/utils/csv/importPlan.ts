import { parseCsv } from './core';
import { parseItemsFromCsv } from './items';
import { parseAssembliesFromCsv } from './assemblies';
import { parseEventReportsFromCsv } from './events';
import { parseFactionOrdersFromCsv, parseGeneralOrdersFromCsv } from './orders';
import { type CsvImportType, type ParsedItemRow, type ParsedAssemblyRow, type ParsedEventReportRow, type ParsedFactionOrderRow, type ParsedGeneralOrderRow, type ParsedReturnRow } from '../../types/csvImport';
import { parseReturnsFromCsv, parseCheckoutsFromCsv } from './custody';
import type { Item, Assembly, StorageLocation } from '../../types';
import type { CsvReference } from './reference';
import { parseOperationsFromCsv } from '../csvOperations';

interface Input { csvContent: string; tabType: CsvImportType; items: Item[]; assemblies: Assembly[]; storageLocations: StorageLocation[]; updateExistingItems: boolean; reference: CsvReference }

export function buildCsvImportPlan({ csvContent, tabType, items, assemblies, storageLocations, updateExistingItems, reference }: Input) {
  // Parse CSV
  const { rows } = (() => {
    if (!csvContent.trim()) return { rows: [] };
    return parseCsv(csvContent);
  })();

  // Parsed Items and Assemblies
  const parsedItems: ParsedItemRow[] = (() => {
    if (tabType === 'assemblies' || rows.length === 0) return [];
    return parseItemsFromCsv(rows, storageLocations, items, reference);
  })();

  const effectiveItemsForAssemblies = (() => {
    if (tabType !== 'combined') return items;
    const map = new Map<string, Item>();
    for (const it of items) {
      map.set(it.name.toLowerCase().trim(), it);
    }
    for (const p of parsedItems) {
      if (p.data.name && !map.has(p.data.name.toLowerCase().trim())) {
        map.set(p.data.name.toLowerCase().trim(), {
          id: `csv-new-${p.index}`,
          name: p.data.name,
          category: p.data.category,
          amount: p.data.amount ?? 0,
          minStock: p.data.minStock,
          value: p.data.value,
          storageLocation: p.storageLocationId || '',
          created: '',
          updated: '',
        } as Item);
      }
    }
    return Array.from(map.values());
  })();

  const parsedAssemblies: ParsedAssemblyRow[] = (() => {
    if (tabType === 'items' || rows.length === 0) return [];
    return parseAssembliesFromCsv(rows, effectiveItemsForAssemblies, assemblies, reference);
  })();

  const parsedEvents: ParsedEventReportRow[] = (() => {
    if (tabType !== 'combined' || rows.length === 0) return [];
    return parseEventReportsFromCsv(rows, effectiveItemsForAssemblies, reference);
  })();

  const parsedOrders: ParsedFactionOrderRow[] = (() => {
    if (tabType !== 'combined' || rows.length === 0) return [];
    return parseFactionOrdersFromCsv(rows, effectiveItemsForAssemblies, reference);
  })();

  const parsedGeneralOrders: ParsedGeneralOrderRow[] = (() => {
    if (tabType !== 'combined' || rows.length === 0) return [];
    return parseGeneralOrdersFromCsv(rows, effectiveItemsForAssemblies, reference);
  })();

  const parsedReturns: ParsedReturnRow[] = (() => {
    if (tabType !== 'combined' || rows.length === 0) return [];
    return parseReturnsFromCsv(rows, effectiveItemsForAssemblies, storageLocations, reference);
  })();
  const parsedCheckouts = tabType === 'combined'
    ? parseCheckoutsFromCsv(rows, effectiveItemsForAssemblies, reference) : [];
  const parsedOperations = tabType === 'combined' ? parseOperationsFromCsv(rows, effectiveItemsForAssemblies) : [];

  // Statistics
  const validItemsCount = parsedItems.filter((i) => i.status === 'valid' || i.status === 'warning' || (i.status === 'duplicate' && updateExistingItems)).length;
  const validAssembliesCount = parsedAssemblies.filter((a) => a.status === 'valid').length;
  const validEventsCount = parsedEvents.filter((event) => event.status === 'valid').length;
  const validOrdersCount = parsedOrders.filter((order) => order.status === 'valid').length;
  const validGeneralOrdersCount = parsedGeneralOrders.filter((order) => order.status === 'valid').length;
  const validReturnsCount = parsedReturns.filter((r) => r.status === 'valid' && r.targetStatus === 'accepted').length;
  const validCheckoutsCount = parsedCheckouts.filter((r) => r.status === 'valid').length;
  const validOperationsCount = parsedOperations.filter((row) => row.status === 'valid').length;
  const totalErrorsCount = parsedItems.filter((i) => i.status === 'error').length
    + parsedAssemblies.filter((a) => a.status === 'error').length
    + parsedEvents.filter((event) => event.status === 'error').length
    + parsedOrders.filter((order) => order.status === 'error').length
    + parsedGeneralOrders.filter((order) => order.status === 'error').length
    + parsedReturns.filter((r) => r.status === 'error').length
    + parsedCheckouts.filter((r) => r.status === 'error').length
    + parsedOperations.filter((row) => row.status === 'error').length;
  const totalDuplicatesCount = parsedItems.filter((i) => i.status === 'duplicate').length + parsedAssemblies.filter((a) => a.status === 'duplicate').length;

  const totalToImport = (tabType === 'assemblies' ? 0 : validItemsCount)
    + (tabType === 'items' ? 0 : validAssembliesCount)
    + validEventsCount
    + validOrdersCount
    + validGeneralOrdersCount
    + validReturnsCount + validCheckoutsCount + validOperationsCount;

  return { rows, parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders, parsedReturns, parsedCheckouts, parsedOperations, validItemsCount, validAssembliesCount, validEventsCount, validOrdersCount, validGeneralOrdersCount, validReturnsCount, validCheckoutsCount, validOperationsCount, totalErrorsCount, totalDuplicatesCount, totalToImport };
}
