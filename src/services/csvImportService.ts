import { assertAuthSession, captureAuthSession } from './authManager';
import { loadAllPages } from './apiPagination';
import { withApiRequestBatch } from './apiClient';
import type { CsvImportCounts } from '../types/csvImport';
import { type CsvImportType, type ParsedItemRow, type ParsedAssemblyRow, type ParsedEventReportRow, type ParsedFactionOrderRow, type ParsedGeneralOrderRow, type ParsedReturnRow } from '../types/csvImport';
import type { Item, StorageLocation } from '../types';
import { createItem, updateItem, createItemAssets, getItemAssets, getItem } from './inventoryService';
import { createAssembly } from './assemblyService';
import { createEventReport, getEventReports, updateEventReport } from './eventService';
import { createFactionOrder, getFactionOrders, getFactionOrder, submitFactionOrder, updateFactionOrder, saveFactionOrderPreparation, markFactionOrderReady, pickUpFactionOrder, returnFactionOrder, closeFactionOrder } from './factionOrderService';
import { createTransaction, getTransactions } from './transactionService';
import { createOrder, generalOrderCommand, getOrders, returnOrder, transitionOrder } from './orderService';
import { createStorageLocation } from './storageLocationService';
import { getItemStock } from '../utils/stock';
import { createCsvOperationImporter } from './csvOperationImport';
import type { ParsedCheckoutRow } from '../types/csvImport';
import type { ParsedOperationRow } from '../utils/csvOperations';

export interface CsvImportResult { successItems: number; updatedItems: number; successAssemblies: number; successEvents: number; successOrders: number; successGeneralOrders: number; successReturns: number; successCheckouts: number; successOperations: number; errors: string[] }

interface ImportPlan {
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
  t: (de: string, en: string) => string;
  setImportProgress: (value: number) => void;
  setImportStatusText: (value: string) => void;
  setImportedCounts: (value: CsvImportCounts) => void;
}

export function runCsvImport(plan: ImportPlan): Promise<CsvImportResult> {
  return withApiRequestBatch(() => runCsvImportBatch(plan), (seconds) => {
    plan.setImportStatusText(plan.t(
      `API-Anfragelimit erreicht. Import wird in ${seconds}s fortgesetzt...`,
      `API rate limit reached. Import resumes in ${seconds}s...`,
    ));
  });
}

async function runCsvImportBatch({ parsedItems, parsedAssemblies, parsedEvents, parsedOrders, parsedGeneralOrders, parsedReturns, parsedCheckouts, parsedOperations, storageLocations, autoCreateLocations, tabType, items, updateExistingItems, validEventsCount, validOrdersCount, validGeneralOrdersCount, validReturnsCount, validCheckoutsCount, validOperationsCount, t, setImportProgress, setImportStatusText, setImportedCounts }: ImportPlan): Promise<CsvImportResult> {
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
    const locCache = new Map<string, string>();
    for (const loc of storageLocations) {
      locCache.set(loc.name.toLowerCase().trim(), loc.id);
    }

    // Step 1: Auto-create missing storage locations if enabled
    if (autoCreateLocations && tabType !== 'assemblies') {
      const missingLocNames = new Set<string>();
      for (const row of parsedItems) {
        if (row.storageLocationName && !row.storageLocationId && !locCache.has(row.storageLocationName.toLowerCase().trim())) {
          missingLocNames.add(row.storageLocationName.trim());
        }
      }

      for (const locName of missingLocNames) {
        try {
          setImportStatusText(t(`Erstelle Lagerort "${locName}"...`, `Creating storage location "${locName}"...`));
          const newLoc = await createStorageLocation({ name: locName });
          locCache.set(locName.toLowerCase().trim(), newLoc.id);
        } catch (err: unknown) {
          assertAuthSession(context);
          errors.push(`Fehler beim Erstellen von Lagerort "${locName}": ${(err as Error).message || err}`);
        }
      }
    }

    // Step 2: Import Items
    const createdItemsMap = new Map<string, Item>();
    for (const item of items) {
      createdItemsMap.set(item.name.toLowerCase().trim(), item);
    }

    if (tabType !== 'assemblies') {
      let itemIndex = 0;
      for (const row of itemsToProcess) {
        itemIndex++;
        setImportStatusText(t(`Importiere Artikel ${itemIndex}/${itemsToProcess.length}: ${row.data.name}`, `Importing item ${itemIndex}/${itemsToProcess.length}: ${row.data.name}`));

        // Resolve location ID if created on the fly
        let locationId = row.data.storageLocation;
        if (!locationId && row.storageLocationName) {
          locationId = locCache.get(row.storageLocationName.toLowerCase().trim()) || '';
        }

        const hasCustomAssets = row.data.trackingMode === 'serialized' && Boolean(row.assetCodes && row.assetCodes.length > 0);
        const payload = {
          ...row.data,
          storageLocation: locationId,
          // When serialized and explicit asset codes are provided, start with amount 0 on item creation
          // so backend does not generate default SKU-xxx assets, then register the explicit codes
          amount: hasCustomAssets ? 0 : row.data.amount,
        };

        try {
          if (row.isExisting && updateExistingItems && row.existingId) {
            const updated = await updateItem(row.existingId, payload);
            updatedItems++;
            createdItemsMap.set(updated.name.toLowerCase().trim(), updated);

            if (hasCustomAssets && row.assetCodes) {
              const existingAssets = await loadAllPages((page, size) => getItemAssets(row.existingId!, { page, size }));
              for (const code of row.assetCodes) {
                if (existingAssets.some((asset) => asset.assetCode.toLowerCase() === code.toLowerCase())) continue;
                try {
                  await createItemAssets(row.existingId, {
                    assetCode: code,
                    currentLocationId: locationId || undefined,
                  });
                } catch (assetErr: unknown) {
                  assertAuthSession(context);
                  errors.push(`Fehler beim Erstellen von Asset "${code}" für "${row.data.name}" (Zeile ${row.index}): ${(assetErr as Error).message || assetErr}`);
                }
              }
            }
          } else if (!row.isExisting) {
            const created = await createItem(payload);
            successItems++;
            createdItemsMap.set(created.name.toLowerCase().trim(), created);

            if (hasCustomAssets && row.assetCodes) {
              for (const code of row.assetCodes) {
                try {
                  await createItemAssets(created.id, {
                    assetCode: code,
                    currentLocationId: locationId || undefined,
                  });
                } catch (assetErr: unknown) {
                  assertAuthSession(context);
                  errors.push(`Fehler beim Erstellen von Asset "${code}" für "${row.data.name}" (Zeile ${row.index}): ${(assetErr as Error).message || assetErr}`);
                }
              }
            }
          }
        } catch (err: unknown) {
          assertAuthSession(context);
          errors.push(`Fehler bei Artikel "${row.data.name}" (Zeile ${row.index}): ${(err as Error).message || err}`);
        } finally {
          reportCompletedRow();
        }
      }
    }

    // Step 3: Import Assemblies
    if (tabType !== 'items') {
      const assembliesToProcess = parsedAssemblies.filter((a) => a.status === 'valid');
      let assemIndex = 0;

      for (const row of assembliesToProcess) {
        assemIndex++;
        setImportStatusText(t(`Erstelle Baugruppe ${assemIndex}/${assembliesToProcess.length}: ${row.data.name}`, `Creating assembly ${assemIndex}/${assembliesToProcess.length}: ${row.data.name}`));

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
    for (const row of parsedEvents.filter((event) => event.status === 'valid')) {
      setImportStatusText(t(
        `Erstelle ${row.data.eventType}-Event vom ${row.data.eventDate}...`,
        `Creating ${row.data.eventType} event on ${row.data.eventDate}...`,
      ));

      const resolveQuantities = (components: ParsedEventReportRow['usedItems']) => {
        const quantities: Record<string, number> = {};
        for (const component of components) {
          const isTempId = component.itemId?.startsWith('csv-new-');
          const item = (!isTempId && component.itemId)
            ? items.find((candidate) => candidate.id === component.itemId)
            : createdItemsMap.get(component.itemName.toLowerCase().trim());
          if (!item) throw new Error(`Artikel "${component.itemName}" konnte nicht gefunden werden`);
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
          event.eventType === data.eventType && event.eventDate.slice(0, 10) === data.eventDate.slice(0, 10)
        ));
        const saved = existing
          ? await updateEventReport(existing.id, data)
          : await createEventReport(data);
        if (!existing) existingEvents.push(saved);
        successEvents++;
      } catch (err: unknown) {
        assertAuthSession(context);
        errors.push(`Event ${row.data.eventType} ${row.data.eventDate}: ${(err as Error).message || err}`);
      } finally {
        reportCompletedRow();
      }
    }

    // Step 5: Import faction orders after their event occurrences exist.
    const existingOrders = parsedOrders.length > 0
      ? await loadAllPages((page, size) => getFactionOrders({ page, size })) : [];
    for (const row of parsedOrders.filter((order) => order.status === 'valid')) {
      setImportStatusText(t(
        `Importiere Bestellung ${row.data.faction} für ${row.data.eventDate}...`,
        `Importing ${row.data.faction} order for ${row.data.eventDate}...`,
      ));

      try {
        const requestedQuantities: Record<string, number> = {};
        for (const component of row.requestedItems) {
          const isTempId = component.itemId?.startsWith('csv-new-');
          const item = (!isTempId && component.itemId)
            ? items.find((candidate) => candidate.id === component.itemId)
            : createdItemsMap.get(component.itemName.toLowerCase().trim());
          if (!item) throw new Error(`Artikel "${component.itemName}" konnte nicht gefunden werden`);
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
          && order.eventDate.slice(0, 10) === data.eventDate.slice(0, 10)
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
              const available = (await loadAllPages((page, size) => getItemAssets(id, { page, size })))
                .filter((asset) => asset.availabilityStatus === 'available');
              if (available.length < quantity) throw new Error(`Nicht genügend Assets für ${item.name}`);
              assetAssignments[id] = available.slice(0, quantity).map((asset) => asset.id);
            }
            finalOrder = await saveFactionOrderPreparation(
              finalOrder.id,
              finalOrder.requestedQuantities || {},
              finalOrder.requestedAssemblyQuantities || {},
              assetAssignments,
            );
          }
          if (finalOrder.status === 'preparing') {
            finalOrder = await markFactionOrderReady(finalOrder.id, 'Automatisch vorbereitet');
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
          throw new Error(`Status ${finalOrder.status} statt ${row.targetStatus}`);
        }
        if (existing) existingOrders.splice(existingOrders.findIndex((order) => order.id === existing.id), 1, finalOrder);
        else existingOrders.push(finalOrder);
        successOrders++;
      } catch (err: unknown) {
        assertAuthSession(context);
        errors.push(`Bestellung ${row.data.eventType} ${row.data.eventDate} ${row.data.faction}: ${(err as Error).message || err}`);
      } finally {
        reportCompletedRow();
      }
    }

    // Step 6: Simulate general orders using the same lifecycle as the order page.
    const existingGeneralOrders = parsedGeneralOrders.length > 0
      ? await loadAllPages((page, size) => getOrders({ page, size })) : [];
    for (const row of parsedGeneralOrders.filter((order) => order.status === 'valid')) {
      setImportStatusText(t(`Importiere allgemeine Bestellung ${row.data.name}...`, `Importing general order ${row.data.name}...`));
      try {
        const resolve = (components: ParsedGeneralOrderRow['requestedItems']) => {
          const quantities: Record<string, number> = {};
          for (const component of components) {
            const item = items.find((candidate) => candidate.id === component.itemId)
              ?? createdItemsMap.get(component.itemName.toLowerCase().trim());
            if (!item) throw new Error(`Artikel "${component.itemName}" konnte nicht gefunden werden`);
            quantities[item.id] = (quantities[item.id] ?? 0) + component.quantity;
          }
          return quantities;
        };
        let event = existingEvents.find((candidate) => candidate.eventType === row.eventType && candidate.eventDate.slice(0, 10) === row.eventDate);
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
              const available = (await loadAllPages((page, size) => getItemAssets(id, { page, size })))
                .filter((asset) => asset.availabilityStatus === 'available');
              if (available.length < quantity) throw new Error(`Nicht genügend Assets für ${item.name}`);
              assetAssignments[id] = available.slice(0, quantity).map((asset) => asset.id);
            }
          }
          order = await generalOrderCommand(order.id, 'prepare', { preparedQuantities: requestedQuantities, assetAssignments });
          order = await transitionOrder(order.id, 'ready');
        }
        if (['picked_up', 'partially_returned', 'returned', 'closed'].includes(row.targetStatus)) order = await transitionOrder(order.id, 'pickup');
        if (['partially_returned', 'returned', 'closed'].includes(row.targetStatus)) {
          order = await returnOrder(order.id, resolve(row.returnedItems), resolve(row.consumedItems));
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
      setImportStatusText(t(
        `Importiere Rückgabe für ${ret.itemName}...`,
        `Importing return for ${ret.itemName}...`,
      ));

      try {
        const item = items.find((candidate) => candidate.id === ret.itemId) || createdItemsMap.get(ret.itemName.toLowerCase().trim());
        if (!item) throw new Error(`Artikel "${ret.itemName}" nicht gefunden`);

        if (ret.generalOrderName) {
          const order = existingGeneralOrders.find((candidate) => candidate.name.toLowerCase() === ret.generalOrderName?.toLowerCase()
            && (!ret.date || existingEvents.find((event) => event.id === candidate.eventOccurrenceId)?.eventDate.slice(0, 10) === ret.date));
          if (!order) throw new Error(`Allgemeine Bestellung "${ret.generalOrderName}" nicht gefunden`);
          if (['returned', 'closed'].includes(order.status)) continue;
          const updated = await returnOrder(order.id, { [item.id]: ret.quantity }, {});
          existingGeneralOrders.splice(existingGeneralOrders.findIndex((candidate) => candidate.id === order.id), 1, updated);
        } else if (item.trackingMode === 'serialized') {
          const assets = await loadAllPages((page, size) => getItemAssets(item.id, { page, size }));
          if (ret.assetCodes.length !== ret.quantity) throw new Error('AssetCodes müssen der Menge entsprechen');
          let recorded = false;
          for (const code of ret.assetCodes) {
            const asset = assets.find((candidate) => candidate.assetCode.toLowerCase() === code.toLowerCase());
            if (!asset) throw new Error(`Asset "${code}" nicht gefunden`);
            if (asset.availabilityStatus === 'available') continue;
            if (!['in_field', 'in_custody', 'returned_pending_check'].includes(asset.availabilityStatus)) {
              throw new Error(`Asset "${code}" kann im Status ${asset.availabilityStatus} nicht zurückgegeben werden`);
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
          const previous = await loadAllPages((page, size) => getTransactions({ itemId: item.id, page, size }));
          if (previous.some((tx) => tx.transactionType === 'checkin' && tx.notes?.includes(marker))) continue;
          const current = await getItem(item.id);
          if (getItemStock(current).checkedOut === 0) continue;
          if (getItemStock(current).checkedOut < ret.quantity) throw new Error('Rückgabemenge übersteigt den ausgeliehenen Bestand');
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
      setImportStatusText(t(`Importiere Ausleihe für ${row.itemName}...`, `Importing checkout for ${row.itemName}...`));
      try {
        const item = createdItemsMap.get(row.itemName.toLowerCase().trim());
        if (!item) throw new Error(`Artikel "${row.itemName}" nicht gefunden`);
        const marker = `CSV checkout row ${row.index}`;
        const previous = await loadAllPages((page, size) => getTransactions({ itemId: item.id, page, size }));
        const imported = previous.filter((tx) => tx.transactionType === 'checkout' && tx.notes?.includes(marker));
        if (item.trackingMode === 'serialized') {
          const assets = await loadAllPages((page, size) => getItemAssets(item.id, { page, size }));
          const selected = row.assetCodes.length
            ? row.assetCodes.map((code) => assets.find((asset) => asset.assetCode === code))
            : assets.filter((asset) => asset.availabilityStatus === 'available').slice(0, row.quantity - imported.length);
          if ((row.assetCodes.length ? selected.length !== row.quantity : selected.length !== row.quantity - imported.length)
            || selected.some((asset) => !asset || (asset.availabilityStatus !== 'available' && !imported.some((tx) => tx.assetInstanceId === asset.id)))) {
            throw new Error('Nicht genügend passende Seriengeräte verfügbar');
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

    // Operations follow stock, assets, events and custody creation. Later rows can reference earlier operations.
    const importOperation = createCsvOperationImporter([...createdItemsMap.values()], locCache, existingEvents);
    for (const row of parsedOperations.filter((entry) => entry.status === 'valid')) {
      setImportStatusText(t(`Importiere Aktion ${row.name}...`, `Importing action ${row.name}...`));
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
  } catch (error) {
    assertAuthSession(context);
    errors.push(t('Import abgebrochen: ', 'Import stopped: ') + (error instanceof Error ? error.message : String(error)));
  }

  return { successItems, updatedItems, successAssemblies, successEvents, successOrders, successGeneralOrders, successReturns, successCheckouts, successOperations, errors };
}
