import { formatDate } from '../utils/dateFormat';
import { assertAuthSession, captureAuthSession } from './authManager';
import { loadAllPages } from './apiPagination';
import { withApiRequestBatch } from './apiClient';
import type { CsvImportCounts } from '../types/csvImport';
import { type CsvImportType, type ParsedItemRow, type ParsedAssemblyRow, type ParsedEventReportRow, type ParsedFactionOrderRow, type ParsedGeneralOrderRow, type ParsedReturnRow } from '../types/csvImport';
import type { Faction, Item, StorageLocation } from '../types';
import { importCsvFactions } from './csvReferenceImport';
import { getAllItemAssets, getItem, itemBatchErrorIndex, saveItemBatch, ITEM_BATCH_LIMIT, type ItemBatchEntry } from './inventoryService';
import { createAssembly } from './assemblyService';
import { createEventReport, getEventReports, updateEventReport } from './eventService';
import { createFactionOrder, getFactionOrders, getFactionOrder, submitFactionOrder, updateFactionOrder, saveFactionOrderPreparation, markFactionOrderReady, pickUpFactionOrder, returnFactionOrder, closeFactionOrder } from './factionOrderService';
import { createTransaction, getTransactions } from './transactionService';
import { createOrder, generalOrderApi, generalOrderCommand, returnOrder, transitionOrder } from './orderService';
import { createStorageLocation } from './storageLocationService';
import { buildLocationIndex, normalizeLocationRef } from '../utils/csv/locations';
import { getItemStock } from '../utils/stock';
import { createCsvOperationImporter } from './csvOperationImport';
import { createCsvLotImporter } from './csvLotImport';
import { createCsvEventLogisticsImporter } from './csvEventLogisticsImport';
import type { ParsedCheckoutRow } from '../types/csvImport';
import type { ParsedOperationRow } from '../utils/csvOperations';
import { translate, type Translator } from '../utils/naming';

export interface CsvImportResult { successItems: number; updatedItems: number; successAssemblies: number; successEvents: number; successOrders: number; successGeneralOrders: number; successReturns: number; successCheckouts: number; successOperations: number; errors: string[] }

interface ImportPlan {
  newFactions: Faction[];
  parsedItems: ParsedItemRow[];
  parsedAssemblies: ParsedAssemblyRow[];
  parsedEvents: ParsedEventReportRow[];
  parsedOrders: ParsedFactionOrderRow[];
  parsedGeneralOrders: ParsedGeneralOrderRow[];
  parsedReturns: ParsedReturnRow[];
  parsedCheckouts: ParsedCheckoutRow[];
  parsedOperations: ParsedOperationRow[];
  storageLocations: StorageLocation[];
  autoCreateLocations: boolean;
  tabType: CsvImportType;
  items: Item[];
  updateExistingItems: boolean;
  validEventsCount: number;
  validOrdersCount: number;
  validGeneralOrdersCount: number;
  validReturnsCount: number;
  validCheckoutsCount: number;
  validOperationsCount: number;
  t: Translator;
  setImportProgress: (value: number) => void;
  setImportStatusText: (value: string) => void;
  setImportedCounts: (value: CsvImportCounts) => void;
}

/** Rows per batch request: bounded below the server limit so a chunk stays well inside the request timeout. */
const ITEM_IMPORT_CHUNK = Math.min(50, ITEM_BATCH_LIMIT);

export function runCsvImport(plan: ImportPlan): Promise<CsvImportResult> {
  return withApiRequestBatch(() => runCsvImportBatch(plan), (seconds) => {
    plan.setImportStatusText(plan.t('services.csvImportService.aPIRateLimitReachedImportResumesInSecondsS', { seconds: seconds }));
  });
}

async function runCsvImportBatch({ newFactions, parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders, parsedReturns, parsedCheckouts, parsedOperations, storageLocations, autoCreateLocations, tabType, items, updateExistingItems, validEventsCount, validOrdersCount, validGeneralOrdersCount, validReturnsCount, validCheckoutsCount, validOperationsCount, t, setImportProgress, setImportStatusText, setImportedCounts }: ImportPlan): Promise<CsvImportResult> {
  const context = captureAuthSession();
  const errors: string[] = [
    ...parsedItems.filter((row) => row.status === 'error').map((row) => `Artikel Zeile ${row.index}: ${row.statusMessage}`),
    ...parsedAssemblies.filter((row) => row.status === 'error').map((row) => `Baugruppe Zeile ${row.index}: ${row.statusMessage}`),
    ...parsedEvents.filter((row) => row.status === 'error').map((row) => `Event Zeile ${row.index}: ${row.statusMessage}`),
    ...parsedOrders.filter((row) => row.status === 'error').map((row) => `Bestellung Zeile ${row.index}: ${row.statusMessage}`),
    ...parsedGeneralOrders.filter((row) => row.status === 'error').map((row) => `Allgemeine Bestellung Zeile ${row.index}: ${row.statusMessage}`),
    ...parsedReturns.filter((row) => row.status === 'error').map((row) => `Rückgabe Zeile ${row.index}: ${row.statusMessage}`),
    ...parsedCheckouts.filter((row) => row.status === 'error').map((row) => `Ausleihe Zeile ${row.index}: ${row.statusMessage}`),
    ...parsedOperations.filter((row) => row.status === 'error').map((row) => `Aktion Zeile ${row.index}: ${row.statusMessage}`),
  ];
  let successItems = 0;
  let updatedItems = 0;
  let successAssemblies = 0;
  let successEvents = 0;
  let successOrders = 0;
  let successGeneralOrders = 0;
  let successReturns = 0;
  let successCheckouts = 0;
  let successOperations = 0;

  const itemsToProcess = tabType === 'assemblies' ? [] : parsedItems.filter((i) => i.status === 'valid' || i.status === 'warning' || (i.status === 'duplicate' && updateExistingItems));
  const totalSteps = itemsToProcess.length
    + (tabType === 'items' ? 0 : parsedAssemblies.filter((a) => a.status === 'valid').length)
    + validEventsCount + validOrdersCount + validGeneralOrdersCount
    + validReturnsCount + validCheckoutsCount + validOperationsCount;
  let currentStep = 0;
  function reportCompletedRow() {
    assertAuthSession(context);
    currentStep++;
    setImportProgress(Math.round((currentStep / Math.max(1, totalSteps)) * 100));
    setImportedCounts({
      items: successItems + updatedItems, assemblies: successAssemblies, events: successEvents,
      orders: successOrders, generalOrders: successGeneralOrders, returns: successReturns,
      checkouts: successCheckouts, operations: successOperations,
    });
  }

  try {
    const factionIds = await importCsvFactions(newFactions);
    assertAuthSession(context);
    // Keys: id, full code, path and unique names (see buildLocationIndex); values are location ids.
    const locCache = new Map<string, string>();
    for (const [key, location] of buildLocationIndex(storageLocations)) if (location) locCache.set(key, location.id);
    const locationsById = new Map(storageLocations.map((location) => [location.id, location]));

    // Step 1: Auto-create missing storage locations level by level, reusing existing leading levels of the path.
    if (autoCreateLocations && tabType !== 'assemblies') {
      const missingPaths = new Map<string, string[]>();
      for (const row of parsedItems) {
        if (row.storageLocationPath && !row.storageLocationId) missingPaths.set(normalizeLocationRef(row.storageLocationPath.join(' / ')), row.storageLocationPath);
      }

      for (const segments of missingPaths.values()) {
        let parent: StorageLocation | undefined;
        for (let depth = 1; depth <= segments.length; depth++) {
          const key = normalizeLocationRef(segments.slice(0, depth).join(' / '));
          const existingId = locCache.get(key);
          if (existingId) { parent = locationsById.get(existingId); continue; }
          const name = segments[depth - 1];
          try {
            setImportStatusText(t('services.csvImportService.creatingStorageLocationLocName', { locName: segments.slice(0, depth).join(' / ') }));
            const created = await createStorageLocation({ name, parentLocationId: parent?.id ?? null });
            locCache.set(key, created.id);
            if (created.fullCode) locCache.set(created.fullCode.toLowerCase(), created.id);
            locationsById.set(created.id, created);
            parent = created;
          } catch (err: unknown) {
            assertAuthSession(context);
            errors.push(`Fehler beim Erstellen von Lagerort "${segments.slice(0, depth).join(' / ')}": ${(err as Error).message || err}`);
            break;
          }
        }
      }
    }

    // Step 2: Import Items
    const createdItemsMap = new Map<string, Item>();
    for (const item of items) {
      createdItemsMap.set(item.name.toLowerCase().trim(), item);
    }

    if (tabType !== 'assemblies') {
      const importLots = createCsvLotImporter();
      const rowsToSave = itemsToProcess.filter((row) => !row.isExisting || (updateExistingItems && row.existingId));
      // Rows that match an existing item but are not updated are complete without a request.
      for (let skipped = itemsToProcess.length - rowsToSave.length; skipped > 0; skipped--) reportCompletedRow();
      const entryFor = (row: ParsedItemRow): ItemBatchEntry => {
        // Resolve location ID if created on the fly
        let locationId = row.data.storageLocation;
        if (!locationId && row.storageLocationPath) {
          locationId = locCache.get(normalizeLocationRef(row.storageLocationPath.join(' / '))) || '';
        }
        const assetCodes = row.data.trackingMode === 'serialized' && row.assetCodes?.length ? row.assetCodes : undefined;
        // Explicit assets and lots book their own opening stock instead of generated units/lots.
        const amount = row.isExisting ? undefined : assetCodes || row.lots?.length ? 0 : row.data.amount;
        return { id: row.isExisting ? row.existingId : undefined, item: { ...row.data, storageLocation: locationId, amount }, assetCodes };
      };

      for (let from = 0; from < rowsToSave.length; from += ITEM_IMPORT_CHUNK) {
        let chunk = rowsToSave.slice(from, from + ITEM_IMPORT_CHUNK);
        setImportStatusText(t('services.csvImportService.importingItemsFromToOfCount', { from: from + 1, to: from + chunk.length, count: rowsToSave.length }));
        // A rejected row fails its whole chunk; report it and resend the remaining rows.
        while (chunk.length > 0) {
          try {
            const saved = await saveItemBatch(chunk.map(entryFor));
            assertAuthSession(context);
            for (const [position, item] of saved.entries()) {
              const row = chunk[position];
              createdItemsMap.set(item.name.toLowerCase().trim(), item);
              if (row.isExisting) updatedItems++;
              else successItems++;
              if (row.lots?.length) {
                try {
                  if (row.storageLocationPath && !locCache.has(normalizeLocationRef(row.storageLocationPath.join(' / ')))) {
                    throw new Error(`Lagerort "${row.storageLocationName}" konnte nicht aufgelöst werden`);
                  }
                  await importLots(item.id, row.lots, item.storageLocation);
                  assertAuthSession(context);
                } catch (error) {
                  assertAuthSession(context);
                  errors.push(`Artikel "${item.name}" (Zeile ${row.index}) gespeichert, Chargenimport unvollständig: ${error instanceof Error ? error.message : String(error)}`);
                }
              }
              reportCompletedRow();
            }
            break;
          } catch (err: unknown) {
            assertAuthSession(context);
            const index = itemBatchErrorIndex(err);
            const failed = index === undefined || !chunk[index] ? chunk : [chunk[index]];
            for (const row of failed) {
              errors.push(`Fehler bei Artikel "${row.data.name}" (Zeile ${row.index}): ${(err as Error).message || err}`);
              reportCompletedRow();
            }
            chunk = failed.length === chunk.length ? [] : chunk.filter((_, position) => position !== index);
          }
        }
      }
    }

    // Step 3: Import Assemblies
    if (tabType !== 'items') {
      const assembliesToProcess = parsedAssemblies.filter((a) => a.status === 'valid');
      let assemIndex = 0;

      for (const row of assembliesToProcess) {
        assemIndex++;
        setImportStatusText(t('services.csvImportService.creatingAssemblyAssemIndexAssembliesToProcesCountName', { assemIndex: assemIndex, assembliesToProcesCount: String(assembliesToProcess.length), name: String(row.data.name) }));

        // Re-resolve components in case some items were created in Step 2
        const finalItemIds: string[] = [];
        const finalQuantities: Record<string, number> = {};
        let allMatched = true;

        for (const comp of row.components) {
          const isTempId = comp.itemId?.startsWith('csv-new-');
          const item = (!isTempId && comp.itemId) ? items.find((i) => i.id === comp.itemId) : createdItemsMap.get(comp.itemName.toLowerCase().trim());
          if (item) {
            finalItemIds.push(item.id);
            finalQuantities[item.id] = (finalQuantities[item.id] ?? 0) + comp.quantity;
          } else {
            allMatched = false;
            errors.push(`Baugruppe "${row.data.name}" (Zeile ${row.index}): Artikel "${comp.itemName}" konnte nicht gefunden werden`);
          }
        }

        if (allMatched && finalItemIds.length > 0) {
          try {
            await createAssembly({
              ...row.data,
              itemIds: [...new Set(finalItemIds)],
              itemQuantities: finalQuantities,
            });
            successAssemblies++;
          } catch (err: unknown) {
            assertAuthSession(context);
            errors.push(`Fehler bei Baugruppe "${row.data.name}" (Zeile ${row.index}): ${(err as Error).message || err}`);
          }
        }
        reportCompletedRow();
      }
    }

    // Step 4: Import event history after all referenced items exist. Matching
    // type/date records are updated so retrying a sample import is safe.
    const existingEvents = parsedEvents.length > 0 || parsedGeneralOrders.length > 0 || parsedOperations.length > 0 ? await getEventReports() : [];
    const importEventLogistics = createCsvEventLogisticsImporter(factionIds);
    // A completed event accepts no new orders or checkouts, so completed rows stay
    // open until their history is imported and are closed in the final step.
    const eventsToClose: { id: string; row: ParsedEventReportRow; data: ParsedEventReportRow['data'] }[] = [];
    for (const row of parsedEvents.filter((event) => event.status === 'valid')) {
      setImportStatusText(t('services.csvImportService.creatingEventTypeEventOnEventDate', { eventType: String(row.data.eventType), eventDate: formatDate(row.data.eventDate) }));

      const resolveQuantities = (components: ParsedEventReportRow['usedItems']) => {
        const quantities: Record<string, number> = {};
        for (const component of components) {
          const isTempId = component.itemId?.startsWith('csv-new-');
          const item = (!isTempId && component.itemId)
            ? items.find((candidate) => candidate.id === component.itemId)
            : createdItemsMap.get(component.itemName.toLowerCase().trim());
          if (!item) throw new Error(translate('services.csvImportService.itemItemNameCouldNotBeFound', { itemName: String(component.itemName) }));
          quantities[item.id] = (quantities[item.id] ?? 0) + component.quantity;
        }
        return quantities;
      };

      try {
        const plannedQuantities = resolveQuantities(row.plannedItems);
        const usedQuantities = resolveQuantities(row.usedItems);
        const data = {
          ...row.data,
          itemIds: Object.keys(usedQuantities),
          plannedQuantities,
          usedQuantities,
        };
        const existing = existingEvents.find((event) => (
          event.eventType === data.eventType && event.eventDate === data.eventDate
        ));
        // Existing completed events reopen too, so a retry can add the orders a failed run missed.
        const closeLater = data.status === 'completed';
        const openData = closeLater ? { ...data, status: 'planned' as const } : data;
        const saved = existing
          ? await updateEventReport(existing.id, openData)
          : await createEventReport(openData);
        if (!existing) existingEvents.push(saved);
        else existingEvents.splice(existingEvents.findIndex((event) => event.id === existing.id), 1, saved);
        if (closeLater) eventsToClose.push({ id: saved.id, row, data });
        successEvents++;
        // The event itself is saved; a logistics failure is reported separately.
        try {
          await importEventLogistics(saved.id, row);
        } catch (err: unknown) {
          assertAuthSession(context);
          errors.push(translate('services.csvImportService.eventEventTypeEventDateSavedAttendeesTimelineIncompleteMessage', { eventType: String(row.data.eventType), eventDate: formatDate(row.data.eventDate), message: String((err as Error).message || err) }));
        }
      } catch (err: unknown) {
        assertAuthSession(context);
        errors.push(`Event ${row.data.eventType} ${formatDate(row.data.eventDate)}: ${(err as Error).message || err}`);
      } finally {
        reportCompletedRow();
      }
    }

    // A leading stock-history sequence establishes balances before orders and
    // standalone custody rows use them. Keep repairs interleaved with movements.
    const operations = parsedOperations.filter((entry) => entry.status === 'valid');
    const historyTypes = new Set(['stock', 'damage', 'repair', 'repair_transition']);
    const firstWorkflow = operations.findIndex((row) => !historyTypes.has(row.operation) || !row.data.occurredAt);
    const historyEnd = firstWorkflow < 0 ? operations.length : firstWorkflow;
    const importOperation = createCsvOperationImporter([...createdItemsMap.values()], locCache, existingEvents);
    async function applyOperation(row: ParsedOperationRow) {
      setImportStatusText(t('services.csvImportService.importingActionName', { name: String(row.name) }));
      try {
        await importOperation(row);
        successOperations++;
      } catch (error) {
        assertAuthSession(context);
        errors.push(`Aktion ${row.name}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        reportCompletedRow();
      }
    }
    for (const row of operations.slice(0, historyEnd)) await applyOperation(row);

    // Step 5: Import faction orders after their event occurrences and stock exist.
    const existingOrders = parsedOrders.length > 0
      ? await loadAllPages((page, size) => getFactionOrders(undefined, page, size)) : [];
    for (const row of parsedOrders.filter((order) => order.status === 'valid')) {
      setImportStatusText(t('services.csvImportService.importingFactionOrderForEventDate', { faction: String(row.data.faction), eventDate: formatDate(row.data.eventDate) }));

      try {
        const requestedQuantities: Record<string, number> = {};
        for (const component of row.requestedItems) {
          const isTempId = component.itemId?.startsWith('csv-new-');
          const item = (!isTempId && component.itemId)
            ? items.find((candidate) => candidate.id === component.itemId)
            : createdItemsMap.get(component.itemName.toLowerCase().trim());
          if (!item) throw new Error(translate('services.csvImportService.itemItemNameCouldNotBeFound', { itemName: String(component.itemName) }));
          requestedQuantities[item.id] = (requestedQuantities[item.id] ?? 0) + component.quantity;
        }
        const data = {
          ...row.data,
          itemIds: Object.keys(requestedQuantities),
          requestedQuantities,
        };
        const existing = existingOrders.find((order) => (
          order.eventType === data.eventType
          && order.faction.toLowerCase() === data.faction.toLowerCase()
          && order.eventDate === data.eventDate
          && (order.notes || '').trim() === (data.notes || '').trim()
        ));
        let finalOrder = existing ? await getFactionOrder(existing.id) : await createFactionOrder(data);
        if (finalOrder.status === 'preparing') {
          finalOrder = await submitFactionOrder(finalOrder.id);
        }
        if (['draft', 'submitted'].includes(finalOrder.status) && existing) {
          finalOrder = await updateFactionOrder(finalOrder.id, data);
        }
        if (row.targetStatus !== 'draft' && finalOrder.status === 'draft') {
          finalOrder = await submitFactionOrder(finalOrder.id);
        }
        if (['ready', 'picked_up', 'returned', 'closed'].includes(row.targetStatus)) {
          if (finalOrder.status === 'submitted') {
            const assetAssignments: Record<string, string[]> = {};
            for (const [id, quantity] of Object.entries(finalOrder.requestedQuantities || {})) {
              const item = [...createdItemsMap.values()].find((candidate) => candidate.id === id);
              if (item?.trackingMode !== 'serialized') continue;
              const available = (await getAllItemAssets(id))
                .filter((asset) => asset.availabilityStatus === 'available');
              if (available.length < quantity) throw new Error(translate('services.csvImportService.notEnoughAssetsForName', { name: String(item.name) }));
              assetAssignments[id] = available.slice(0, quantity).map((asset) => asset.id);
            }
            finalOrder = await saveFactionOrderPreparation(
              finalOrder,
              finalOrder.requestedQuantities || {},
              finalOrder.requestedAssemblyQuantities || {},
              assetAssignments,
            );
          }
          if (finalOrder.status === 'preparing') {
            finalOrder = await markFactionOrderReady(finalOrder.id, 'Automatisch vorbereitet', undefined,
              row.pickupPoint?.latitude, row.pickupPoint?.longitude);
          }
          if (['picked_up', 'returned', 'closed'].includes(row.targetStatus) && finalOrder.status === 'ready') {
            finalOrder = await pickUpFactionOrder(finalOrder.id);
          }
          if (['returned', 'closed'].includes(row.targetStatus) && ['picked_up', 'partially_returned'].includes(finalOrder.status)) {
            finalOrder = await returnFactionOrder(finalOrder.id);
          }
          if (row.targetStatus === 'closed' && finalOrder.status === 'returned') {
            finalOrder = await closeFactionOrder(finalOrder.id);
          }
        }
        if (finalOrder.status !== row.targetStatus) {
          throw new Error(translate('services.csvImportService.statusStatusInsteadOfTargetStatus', { status: String(finalOrder.status), targetStatus: String(row.targetStatus) }));
        }
        if (existing) existingOrders.splice(existingOrders.findIndex((order) => order.id === existing.id), 1, finalOrder);
        else existingOrders.push(finalOrder);
        successOrders++;
      } catch (err: unknown) {
        assertAuthSession(context);
        errors.push(`Bestellung ${row.data.eventType} ${formatDate(row.data.eventDate)} ${row.data.faction}: ${(err as Error).message || err}`);
      } finally {
        reportCompletedRow();
      }
    }

    // Step 6: Simulate general orders using the same lifecycle as the order page.
    const existingGeneralOrders = parsedGeneralOrders.length > 0
      ? await loadAllPages((page, size) => generalOrderApi.getPage(undefined, page, size)) : [];
    for (const row of parsedGeneralOrders.filter((order) => order.status === 'valid')) {
      setImportStatusText(t('services.csvImportService.importingGeneralOrderName', { name: String(row.data.name) }));
      try {
        const resolve = (components: ParsedGeneralOrderRow['requestedItems']) => {
          const quantities: Record<string, number> = {};
          for (const component of components) {
            const item = items.find((candidate) => candidate.id === component.itemId)
              ?? createdItemsMap.get(component.itemName.toLowerCase().trim());
            if (!item) throw new Error(translate('services.csvImportService.itemItemNameCouldNotBeFound', { itemName: String(component.itemName) }));
            quantities[item.id] = (quantities[item.id] ?? 0) + component.quantity;
          }
          return quantities;
        };
        let event = existingEvents.find((candidate) => candidate.eventType === row.eventType && candidate.eventDate === row.eventDate);
        if (!event) {
          event = await createEventReport({ eventType: row.eventType!, eventDate: row.eventDate,
            status: 'planned', itemIds: [], plannedQuantities: {}, usedQuantities: {}, notes: '' });
          existingEvents.push(event);
        }
        const requestedQuantities = resolve(row.requestedItems);
        let order = existingGeneralOrders.find((candidate) => candidate.name.toLowerCase() === row.data.name.toLowerCase()
          && candidate.eventOccurrenceId === event.id);
        if (order) {
          successGeneralOrders++;
          continue;
        }
        order = await createOrder({ name: row.data.name, purpose: row.data.purpose,
          eventOccurrenceId: event.id, requestedQuantities });
        existingGeneralOrders.push(order);
        if (row.targetStatus !== 'draft') order = await transitionOrder(order.id, 'submit');
        if (['ready', 'picked_up', 'partially_returned', 'returned', 'closed'].includes(row.targetStatus)) {
          const assetAssignments: Record<string, string[]> = {};
          for (const [id, quantity] of Object.entries(requestedQuantities)) {
            const item = items.find((candidate) => candidate.id === id) ?? [...createdItemsMap.values()].find((candidate) => candidate.id === id);
            if (item?.trackingMode === 'serialized') {
              const available = (await getAllItemAssets(id))
                .filter((asset) => asset.availabilityStatus === 'available');
              if (available.length < quantity) throw new Error(translate('services.csvImportService.notEnoughAssetsForName', { name: String(item.name) }));
              assetAssignments[id] = available.slice(0, quantity).map((asset) => asset.id);
            }
          }
          order = await generalOrderCommand(order.id, 'prepare', { preparedQuantities: requestedQuantities, assetAssignments });
          order = await transitionOrder(order.id, 'ready');
        }
        if (['picked_up', 'partially_returned', 'returned', 'closed'].includes(row.targetStatus)) order = await transitionOrder(order.id, 'pickup');
        // An order of consumables only is complete at pickup.
        if (['partially_returned', 'returned', 'closed'].includes(row.targetStatus) && row.returnedItems.length && order.status === 'picked_up') {
          order = await returnOrder(order.id, resolve(row.returnedItems));
        }
        if (row.targetStatus === 'closed') await transitionOrder(order.id, 'close');
        successGeneralOrders++;
      } catch (err: unknown) {
        assertAuthSession(context);
        errors.push(`Allgemeine Bestellung ${row.data.name}: ${(err as Error).message || err}`);
      } finally {
        reportCompletedRow();
      }
    }

    // Step 7: Import standalone returns if any
    for (const ret of parsedReturns.filter((r) => r.status === 'valid' && r.targetStatus === 'accepted')) {
      setImportStatusText(t('services.csvImportService.importingReturnForItemName', { itemName: String(ret.itemName) }));

      try {
        const item = items.find((candidate) => candidate.id === ret.itemId) || createdItemsMap.get(ret.itemName.toLowerCase().trim());
        if (!item) throw new Error(translate('services.csvImportService.itemItemNameNotFound', { itemName: String(ret.itemName) }));

        if (ret.generalOrderName) {
          const order = existingGeneralOrders.find((candidate) => candidate.name.toLowerCase() === ret.generalOrderName?.toLowerCase()
            && (!ret.date || existingEvents.find((event) => event.id === candidate.eventOccurrenceId)?.eventDate === ret.date));
          if (!order) throw new Error(translate('services.csvImportService.generalOrderGeneralOrderNameNotFound', { generalOrderName: String(ret.generalOrderName) }));
          if (['returned', 'closed'].includes(order.status)) continue;
          const updated = await returnOrder(order.id, { [item.id]: ret.quantity });
          existingGeneralOrders.splice(existingGeneralOrders.findIndex((candidate) => candidate.id === order.id), 1, updated);
        } else if (item.trackingMode === 'serialized') {
          const assets = await getAllItemAssets(item.id);
          if (ret.assetCodes.length !== ret.quantity) throw new Error(translate('services.csvImportService.assetCodesMustMatchTheQuantity'));
          let recorded = false;
          for (const code of ret.assetCodes) {
            const asset = assets.find((candidate) => candidate.assetCode.toLowerCase() === code.toLowerCase());
            if (!asset) throw new Error(translate('services.csvImportService.assetCodeNotFound', { code: code }));
            if (asset.availabilityStatus === 'available') continue;
            if (!['in_field', 'in_custody', 'returned_pending_check'].includes(asset.availabilityStatus)) {
              throw new Error(translate('services.csvImportService.assetCodeCannotBeReturnedInStatusAvailabilityStatus', { code: code, availabilityStatus: String(asset.availabilityStatus) }));
            }
            await createTransaction({
              itemId: item.id,
              transactionType: 'checkin',
              quantityChanged: 1,
              assetInstanceId: asset.id,
              reason: 'CSV-Import Rückgabe',
              notes: `CSV return row ${ret.index}: ${ret.notes}`,
              eventType: ret.eventType,
              faction: ret.faction,
            });
            recorded = true;
          }
          if (!recorded) continue;
        } else {
          const marker = `CSV return row ${ret.index}`;
          const previous = await loadAllPages((page, size) => getTransactions({ itemId: item.id }, page, size));
          if (previous.some((tx) => tx.transactionType === 'checkin' && tx.notes?.includes(marker))) continue;
          const current = await getItem(item.id);
          if (getItemStock(current).checkedOut === 0) continue;
          if (getItemStock(current).checkedOut < ret.quantity) throw new Error(translate('services.csvImportService.returnQuantityExceedsTheCheckedOutStock'));
          await createTransaction({
            itemId: item.id,
            transactionType: 'checkin',
            quantityChanged: ret.quantity,
            reason: 'CSV-Import Rückgabe',
            notes: `${marker}: ${ret.notes}`,
            eventType: ret.eventType,
            faction: ret.faction,
          });
        }
        successReturns++;
      } catch (err: unknown) {
        assertAuthSession(context);
        errors.push(`Rückgabe ${ret.itemName}: ${(err as Error).message || err}`);
      } finally {
        reportCompletedRow();
      }
    }

    // Step 8: Apply explicit checkout rows after item and asset creation.
    for (const row of parsedCheckouts.filter((entry) => entry.status === 'valid')) {
      setImportStatusText(t('services.csvImportService.importingCheckoutForItemName', { itemName: String(row.itemName) }));
      try {
        const item = createdItemsMap.get(row.itemName.toLowerCase().trim());
        if (!item) throw new Error(translate('services.csvImportService.itemItemNameNotFound', { itemName: String(row.itemName) }));
        const marker = `CSV checkout row ${row.index}`;
        const previous = await loadAllPages((page, size) => getTransactions({ itemId: item.id }, page, size));
        const imported = previous.filter((tx) => tx.transactionType === 'checkout' && tx.notes?.includes(marker));
        if (item.trackingMode === 'serialized') {
          const assets = await getAllItemAssets(item.id);
          const selected = row.assetCodes.length
            ? row.assetCodes.map((code) => assets.find((asset) => asset.assetCode === code))
            : assets.filter((asset) => asset.availabilityStatus === 'available').slice(0, row.quantity - imported.length);
          if ((row.assetCodes.length ? selected.length !== row.quantity : selected.length !== row.quantity - imported.length)
            || selected.some((asset) => !asset || (asset.availabilityStatus !== 'available' && !imported.some((tx) => tx.assetInstanceId === asset.id)))) {
            throw new Error(translate('services.csvImportService.notEnoughMatchingSerialisedAssetsAvailable'));
          }
          for (const asset of selected) {
            if (imported.some((tx) => tx.assetInstanceId === asset!.id)) continue;
            await createTransaction({ itemId: item.id, transactionType: 'checkout', quantityChanged: 1,
              assetInstanceId: asset!.id, eventType: row.eventType, faction: row.faction,
              reason: 'CSV-Import Ausleihe', notes: `${marker}: ${row.notes}` });
          }
        } else {
          if (imported.length) continue;
          await createTransaction({ itemId: item.id, transactionType: 'checkout', quantityChanged: row.quantity,
            eventType: row.eventType, faction: row.faction,
            reason: 'CSV-Import Ausleihe', notes: `${marker}: ${row.notes}` });
        }
        successCheckouts++;
      } catch (err: unknown) {
        assertAuthSession(context);
        errors.push(`Ausleihe ${row.itemName}: ${(err as Error).message || err}`);
      } finally {
        reportCompletedRow();
      }
    }

    // Remaining workflows can reference history operations and newly created custody.
    for (const row of operations.slice(historyEnd)) await applyOperation(row);

    // Step 9: Close completed events. Closing freezes the usage derived from the
    // imported orders; a "Verwendet" cell replaces it as the explicit report.
    for (const { id, row, data } of eventsToClose) {
      setImportStatusText(t('services.csvImportService.closingEventTypeEventOnEventDate', { eventType: String(data.eventType), eventDate: formatDate(data.eventDate) }));
      try {
        await updateEventReport(id, { ...data, usedQuantities: row.usedItems.length ? data.usedQuantities : undefined });
      } catch (err: unknown) {
        assertAuthSession(context);
        errors.push(`Event ${data.eventType} ${formatDate(data.eventDate)}: ${(err as Error).message || err}`);
      }
    }
  } catch (error) {
    assertAuthSession(context);
    errors.push(t('services.csvImportService.importStopped') + (error instanceof Error ? error.message : String(error)));
  }

  return { successItems, updatedItems, successAssemblies, successEvents, successOrders, successGeneralOrders, successReturns, successCheckouts, successOperations, errors };
}
