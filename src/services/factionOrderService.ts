import pb from './pocketbaseClient';
import type {
  DamageReport,
  Assembly,
  FactionOrder,
  FactionOrderFormData,
  FactionOrderHistoryAction,
  FactionOrderHistoryEntry,
  FactionOrderStatus,
  Item,
  StockTransaction,
} from '../types';
import { factionKey, isFactionForEvent } from '../types';
import { calculateItemStock } from '../utils/stock';
import { expandFactionOrderComponents } from '../utils/factionOrderQuantities';

const COLLECTION = 'inventory_faction_orders';
const TRANSACTIONS_COLLECTION = 'inventory_stock_transactions';
const EXPAND = 'itemIds,itemIds.storageLocation,assemblyIds,createdBy,preparedBy,readyBy,pickedUpBy,returnedBy,pickupLocation';

function currentActor(): { id: string; name: string } {
  const record = pb.authStore.record;
  if (!record?.id) throw new Error('Authentication required');
  return {
    id: record.id,
    name: String(record.name || record.username || record.email || record.id),
  };
}

function currentAccess(): { manager: boolean; factions: string[] } {
  const record = pb.authStore.record;
  if (!record?.id) throw new Error('Authentication required');
  const role = String(record.role || '').trim().toLowerCase();
  if (role === 'admin' || role === 'manager' || role === 'inventory_manager') {
    return { manager: true, factions: [] };
  }
  return {
    manager: false,
    factions: Array.isArray(record.faction) ? record.faction : [],
  };
}

async function assertFactionAccess(_eventType: string, faction: string): Promise<void> {
  const access = await currentAccess();
  if (!access.manager && !access.factions.includes(faction)) {
    throw new Error('You do not have access to this faction');
  }
}

async function assertInventoryManager(): Promise<void> {
  if (!(await currentAccess()).manager) throw new Error('Inventory manager access required');
}

function orderCodePrefix(eventType: string, faction: string, eventDate: string): string {
  const year = new Date(eventDate).getUTCFullYear();
  const factionPart = faction.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase();
  return `${eventType}-${factionPart}-${year}`;
}

async function nextOrderCode(eventType: string, faction: string, eventDate: string): Promise<string> {
  const prefix = orderCodePrefix(eventType, faction, eventDate);
  const records = await pb.collection(COLLECTION).getFullList<{ orderCode?: string }>({ fields: 'orderCode' });
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{4})$`, 'i');
  const sequence = records.reduce((highest, record) => {
    const match = record.orderCode?.match(pattern);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

function withOrderCode(order: FactionOrder): FactionOrder {
  if (order.orderCode) return order;
  return { ...order, orderCode: `${orderCodePrefix(order.eventType, order.faction, order.eventDate)}-${order.id.slice(-4).toUpperCase()}`, factionKey: order.factionKey || factionKey(order.eventType, order.faction) };
}

function timestamp(): string {
  return new Date().toISOString();
}

function historyEntry(
  action: FactionOrderHistoryAction,
  quantities?: Record<string, number>,
  assemblyQuantities?: Record<string, number>,
  note?: string,
): FactionOrderHistoryEntry {
  const actor = currentActor();
  return { action, userId: actor.id, userName: actor.name, timestamp: timestamp(), quantities, assemblyQuantities, note };
}

function normalizedQuantities(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => Number.isInteger(value) && value > 0)
      .map(([itemId, value]) => [itemId, value]),
  );
}

function validateOrderData(data: FactionOrderFormData): {
  requestedQuantities: Record<string, number>;
  requestedAssemblyQuantities: Record<string, number>;
} {
  if (!isFactionForEvent(data.eventType, data.faction)) throw new Error('Faction does not belong to the selected event');
  const requestedQuantities = normalizedQuantities(data.requestedQuantities);
  const requestedAssemblyQuantities = normalizedQuantities(data.requestedAssemblyQuantities ?? {});
  if (!Object.keys(requestedQuantities).length && !Object.keys(requestedAssemblyQuantities).length) {
    throw new Error('Add at least one item or assembly to the order list');
  }
  if (!data.eventDate) throw new Error('Event date is required');
  if (!data.pickupLocation) throw new Error('Pickup location is required');
  return { requestedQuantities, requestedAssemblyQuantities };
}

function previousHistory(order: FactionOrder): FactionOrderHistoryEntry[] {
  return Array.isArray(order.history) ? order.history : [];
}

function clampPreparedQuantities(
  prepared: Record<string, number> | undefined,
  requested: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(requested)
      .map(([id, maximum]) => [id, Math.min(prepared?.[id] ?? 0, maximum)] as const)
      .filter(([, value]) => value > 0),
  );
}

function reservedByOtherOrders(
  orders: FactionOrder[],
  currentOrderId: string,
  assemblies: Assembly[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const candidate of orders) {
    if (candidate.id === currentOrderId || !['preparing', 'ready'].includes(candidate.status)) continue;
    for (const [itemId, quantity] of Object.entries(expandFactionOrderComponents(candidate, assemblies, 'prepared'))) {
      result[itemId] = (result[itemId] ?? 0) + quantity;
    }
  }
  return result;
}

export async function getFactionOrders(filters?: { eventType?: string; faction?: string }): Promise<FactionOrder[]> {
  const parts: string[] = [];
  if (filters?.eventType) parts.push(pb.filter('eventType = {:eventType}', { eventType: filters.eventType }));
  if (filters?.faction) parts.push(pb.filter('faction = {:faction}', { faction: filters.faction }));
  const orders = (await pb.collection(COLLECTION).getFullList<FactionOrder>({
    sort: '-eventDate,-created',
    filter: parts.join(' && ') || undefined,
    expand: EXPAND,
  })).map(withOrderCode);
  const access = await currentAccess();
  return access.manager ? orders : orders.filter((order) => access.factions.includes(order.faction));
}

export async function getFactionOrder(id: string): Promise<FactionOrder> {
  return withOrderCode(await pb.collection(COLLECTION).getOne<FactionOrder>(id, { expand: EXPAND }));
}

export async function createFactionOrder(data: FactionOrderFormData): Promise<FactionOrder> {
  const actor = currentActor();
  await assertFactionAccess(data.eventType, data.faction);
  const { requestedQuantities, requestedAssemblyQuantities } = validateOrderData(data);
  const itemIds = Object.keys(requestedQuantities);
  const assemblyIds = Object.keys(requestedAssemblyQuantities);
  const created = historyEntry('created', requestedQuantities, requestedAssemblyQuantities);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderCode = await nextOrderCode(data.eventType, data.faction, data.eventDate);
    try {
      return await pb.collection(COLLECTION).create<FactionOrder>({
        ...data,
        orderCode,
        factionKey: factionKey(data.eventType, data.faction),
        eventDate: new Date(`${data.eventDate.slice(0, 10)}T12:00:00.000Z`).toISOString(),
        itemIds,
        assemblyIds,
        requestedQuantities,
        requestedAssemblyQuantities,
        preparedQuantities: {},
        preparedAssemblyQuantities: {},
        status: 'draft',
        createdBy: actor.id,
        history: [created],
      }, { expand: EXPAND });
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  throw new Error('Could not allocate an order code');
}

export async function updateFactionOrder(id: string, data: FactionOrderFormData): Promise<FactionOrder> {
  const order = await getFactionOrder(id);
  const access = await currentAccess();
  if (!access.manager && order.createdBy !== currentActor().id) throw new Error('Faction leaders can only edit their own orders');
  await assertFactionAccess(data.eventType, data.faction);
  if (order.status === 'picked_up') throw new Error('Return this order list before correcting it');
  const { requestedQuantities, requestedAssemblyQuantities } = validateOrderData(data);
  const isHistoricalCorrection = order.status === 'returned';
  const reopensSubmission = order.status === 'submitted';
  const shouldClearPreparation = ['draft', 'submitted', 'cancelled'].includes(order.status);
  const preparedQuantities = isHistoricalCorrection
    ? requestedQuantities
    : shouldClearPreparation
      ? {}
      : clampPreparedQuantities(order.preparedQuantities, requestedQuantities);
  const preparedAssemblyQuantities = isHistoricalCorrection
    ? requestedAssemblyQuantities
    : shouldClearPreparation
      ? {}
      : clampPreparedQuantities(order.preparedAssemblyQuantities, requestedAssemblyQuantities);
  const preparationComplete = Object.entries(requestedQuantities).every(
    ([itemId, requested]) => (preparedQuantities[itemId] ?? 0) === requested,
  ) && Object.entries(requestedAssemblyQuantities).every(
    ([assemblyId, requested]) => (preparedAssemblyQuantities[assemblyId] ?? 0) === requested,
  );
  const reopensPreparation = order.status === 'ready' && !preparationComplete;
  const entry = historyEntry(
    isHistoricalCorrection ? 'historical_correction' : 'updated',
    requestedQuantities,
    requestedAssemblyQuantities,
  );
  const nextHistory = [...previousHistory(order), entry];
  if (reopensPreparation) {
    nextHistory.push(historyEntry('preparation_reopened', preparedQuantities, preparedAssemblyQuantities));
  }
  if (reopensSubmission) {
    nextHistory.push(historyEntry('submission_reopened', requestedQuantities, requestedAssemblyQuantities));
  }
  const updateData = {
    ...data,
    factionKey: factionKey(data.eventType, data.faction),
    eventDate: new Date(`${data.eventDate.slice(0, 10)}T12:00:00.000Z`).toISOString(),
    itemIds: Object.keys(requestedQuantities),
    assemblyIds: Object.keys(requestedAssemblyQuantities),
    requestedQuantities,
    requestedAssemblyQuantities,
    preparedQuantities,
    preparedAssemblyQuantities,
    ...(reopensSubmission ? { status: 'draft' } : {}),
    ...(reopensPreparation ? { status: 'preparing', readyBy: null, readyAt: null } : {}),
    history: nextHistory,
  };
  if (!isHistoricalCorrection) {
    return pb.collection(COLLECTION).update<FactionOrder>(id, updateData, { expand: EXPAND });
  }

  const [assemblies, transactions] = await Promise.all([
    pb.collection('inventory_assemblies').getFullList<Assembly>(),
    pb.collection(TRANSACTIONS_COLLECTION).getFullList<StockTransaction>({
      filter: pb.filter('factionOrderId = {:id}', { id }),
    }),
  ]);
  const correctedComponents = expandFactionOrderComponents({ ...order, ...updateData }, assemblies, 'prepared');
  const batch = pb.createBatch();
  batch.collection(COLLECTION).update(id, updateData);
  const transactionUserId = order.pickedUpBy || currentActor().id;
  for (const transactionType of ['checkout', 'checkin'] as const) {
    const existingByItem = new Map<string, StockTransaction[]>();
    for (const transaction of transactions.filter((candidate) => candidate.transactionType === transactionType)) {
      existingByItem.set(transaction.itemId, [...(existingByItem.get(transaction.itemId) ?? []), transaction]);
    }
    for (const [itemId, quantity] of Object.entries(correctedComponents)) {
      const [existing, ...duplicates] = existingByItem.get(itemId) ?? [];
      const transactionData = {
        itemId,
        transactionType,
        quantityChanged: quantity,
        userId: transactionUserId,
        factionOrderId: id,
        reason: `Faction order ${transactionType === 'checkout' ? 'pickup' : 'return'}: ${data.eventType} / ${data.faction}`,
        notes: data.notes ?? '',
        timestamp: transactionType === 'checkout'
          ? order.pickedUpAt || order.eventDate
          : order.returnedAt || order.eventDate,
      };
      if (existing) batch.collection(TRANSACTIONS_COLLECTION).update(existing.id, transactionData);
      else batch.collection(TRANSACTIONS_COLLECTION).create(transactionData);
      for (const duplicate of duplicates) batch.collection(TRANSACTIONS_COLLECTION).delete(duplicate.id);
      existingByItem.delete(itemId);
    }
    for (const staleTransactions of existingByItem.values()) {
      for (const stale of staleTransactions) batch.collection(TRANSACTIONS_COLLECTION).delete(stale.id);
    }
  }
  await batch.send();
  return getFactionOrder(id);
}

export async function submitFactionOrder(id: string): Promise<FactionOrder> {
  const order = await getFactionOrder(id);
  if (order.status !== 'draft') throw new Error('Only a draft can be submitted for processing');
  const entry = historyEntry('submitted', order.requestedQuantities, order.requestedAssemblyQuantities);
  return pb.collection(COLLECTION).update<FactionOrder>(id, {
    status: 'submitted',
    history: [...previousHistory(order), entry],
  }, { expand: EXPAND });
}

export async function startFactionOrderPreparation(id: string): Promise<FactionOrder> {
  await assertInventoryManager();
  const order = await getFactionOrder(id);
  if (order.status !== 'submitted') throw new Error('Only an order submitted for processing can start preparation');
  const entry = historyEntry('preparation_started');
  return pb.collection(COLLECTION).update<FactionOrder>(id, {
    status: 'preparing',
    history: [...previousHistory(order), entry],
  }, { expand: EXPAND });
}

export async function saveFactionOrderPreparation(
  id: string,
  values: Record<string, number>,
  assemblyValues: Record<string, number>,
): Promise<FactionOrder> {
  await assertInventoryManager();
  const order = await getFactionOrder(id);
  if (order.status !== 'preparing') throw new Error('This order list is not being prepared');
  const preparedQuantities: Record<string, number> = {};
  for (const [itemId, requested] of Object.entries(order.requestedQuantities)) {
    const value = values[itemId] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > requested) {
      throw new Error(`Prepared quantity must be between 0 and ${requested}`);
    }
    if (value > 0) preparedQuantities[itemId] = value;
  }
  const preparedAssemblyQuantities: Record<string, number> = {};
  for (const [assemblyId, requested] of Object.entries(order.requestedAssemblyQuantities ?? {})) {
    const value = assemblyValues[assemblyId] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > requested) {
      throw new Error(`Prepared assembly quantity must be between 0 and ${requested}`);
    }
    if (value > 0) preparedAssemblyQuantities[assemblyId] = value;
  }
  const [transactions, damageReports, items, assemblies, orders] = await Promise.all([
    pb.collection(TRANSACTIONS_COLLECTION).getFullList<StockTransaction>(),
    pb.collection('inventory_damage_reports').getFullList<DamageReport>(),
    pb.collection('inventory_items').getFullList<Item>(),
    pb.collection('inventory_assemblies').getFullList<Assembly>(),
    getFactionOrders(),
  ]);
  for (const assemblyId of Object.keys(preparedAssemblyQuantities)) {
    if (!assemblies.some((assembly) => assembly.id === assemblyId)) throw new Error(`Assembly ${assemblyId} no longer exists`);
  }
  const proposedComponents = expandFactionOrderComponents({
    ...order,
    preparedQuantities,
    preparedAssemblyQuantities,
  }, assemblies, 'prepared');
  const otherReservations = reservedByOtherOrders(orders, id, assemblies);
  for (const [itemId, quantity] of Object.entries(proposedComponents)) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error(`Item ${itemId} no longer exists`);
    const remaining = calculateItemStock(itemId, transactions, damageReports, item.amount ?? 0).remaining;
    const availableToPromise = Math.max(0, remaining - (otherReservations[itemId] ?? 0));
    if (quantity > availableToPromise) throw new Error(`${item.name}: only ${availableToPromise} available after other reservations`);
  }
  const actor = currentActor();
  const preparedAt = timestamp();
  const entry = historyEntry('preparation_saved', preparedQuantities, preparedAssemblyQuantities);
  return pb.collection(COLLECTION).update<FactionOrder>(id, {
    preparedQuantities,
    preparedAssemblyQuantities,
    preparedBy: actor.id,
    preparedAt,
    history: [...previousHistory(order), entry],
  }, { expand: EXPAND });
}

export async function markFactionOrderReady(id: string, note?: string): Promise<FactionOrder> {
  await assertInventoryManager();
  const order = await getFactionOrder(id);
  if (order.status !== 'preparing') throw new Error('Only an order being prepared can be marked ready');
  const isComplete = Object.entries(order.requestedQuantities).every(
    ([itemId, requested]) => (order.preparedQuantities[itemId] ?? 0) === requested,
  ) && Object.entries(order.requestedAssemblyQuantities ?? {}).every(
    ([assemblyId, requested]) => (order.preparedAssemblyQuantities?.[assemblyId] ?? 0) === requested,
  );
  if (!isComplete) throw new Error('Prepare every requested item before marking the list ready');
  const actor = currentActor();
  const readyAt = timestamp();
  const entry = historyEntry('ready', order.preparedQuantities, order.preparedAssemblyQuantities, note?.trim() || undefined);
  return pb.collection(COLLECTION).update<FactionOrder>(id, {
    status: 'ready',
    readyBy: actor.id,
    readyAt,
    history: [...previousHistory(order), entry],
  }, { expand: EXPAND });
}

export async function reopenFactionOrderPreparation(id: string, note?: string): Promise<FactionOrder> {
  await assertInventoryManager();
  const order = await getFactionOrder(id);
  if (order.status !== 'ready') throw new Error('Only a ready order list can be moved back to preparation');
  const entry = historyEntry(
    'preparation_reopened',
    order.preparedQuantities,
    order.preparedAssemblyQuantities,
    note?.trim() || undefined,
  );
  return pb.collection(COLLECTION).update<FactionOrder>(id, {
    status: 'preparing',
    readyBy: null,
    readyAt: null,
    history: [...previousHistory(order), entry],
  }, { expand: EXPAND });
}

export async function pickUpFactionOrder(id: string): Promise<FactionOrder> {
  await assertInventoryManager();
  const order = await getFactionOrder(id);
  if (order.status !== 'ready') throw new Error('Only a ready order list can be picked up');
  const actor = currentActor();
  const [transactions, damageReports, items, assemblies, orders] = await Promise.all([
    pb.collection(TRANSACTIONS_COLLECTION).getFullList<StockTransaction>(),
    pb.collection('inventory_damage_reports').getFullList<DamageReport>(),
    pb.collection('inventory_items').getFullList<Item>(),
    pb.collection('inventory_assemblies').getFullList<Assembly>(),
    getFactionOrders(),
  ]);
  for (const assemblyId of Object.keys(order.preparedAssemblyQuantities ?? {})) {
    if (!assemblies.some((assembly) => assembly.id === assemblyId)) throw new Error(`Assembly ${assemblyId} no longer exists`);
  }
  const componentQuantities = expandFactionOrderComponents(order, assemblies, 'prepared');
  const otherReservations = reservedByOtherOrders(orders, id, assemblies);
  for (const [itemId, quantity] of Object.entries(componentQuantities)) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error(`Item ${itemId} no longer exists`);
    const remaining = calculateItemStock(itemId, transactions, damageReports, item.amount ?? 0).remaining;
    const available = Math.max(0, remaining - (otherReservations[itemId] ?? 0));
    if (quantity > available) throw new Error(`${item.name}: only ${available} available`);
  }

  const pickedUpAt = timestamp();
  const entry = historyEntry('picked_up', order.preparedQuantities, order.preparedAssemblyQuantities);
  const batch = pb.createBatch();
  batch.collection(COLLECTION).update(id, {
    status: 'picked_up',
    pickedUpBy: actor.id,
    pickedUpAt,
    history: [...previousHistory(order), entry],
  });
  for (const [itemId, quantity] of Object.entries(componentQuantities)) {
    if (quantity < 1) continue;
    batch.collection(TRANSACTIONS_COLLECTION).create({
      itemId,
      transactionType: 'checkout',
      quantityChanged: quantity,
      userId: actor.id,
      factionOrderId: id,
      reason: `Faction order pickup: ${order.eventType} / ${order.faction}`,
      notes: order.notes ?? '',
      timestamp: pickedUpAt,
    });
  }
  const [updated] = await batch.send();
  return getFactionOrder(String(updated.body.id ?? id));
}

export async function returnFactionOrder(id: string): Promise<FactionOrder> {
  await assertInventoryManager();
  const order = await getFactionOrder(id);
  if (order.status !== 'picked_up') throw new Error('Only a picked-up order list can be returned');
  if (!order.pickedUpBy) throw new Error('The pickup user is missing from this order list');
  const actor = currentActor();
  const returnedAt = timestamp();
  const assemblies = await pb.collection('inventory_assemblies').getFullList<Assembly>();
  for (const assemblyId of Object.keys(order.preparedAssemblyQuantities ?? {})) {
    if (!assemblies.some((assembly) => assembly.id === assemblyId)) throw new Error(`Assembly ${assemblyId} no longer exists`);
  }
  const componentQuantities = expandFactionOrderComponents(order, assemblies, 'prepared');
  const entry = historyEntry('returned', order.preparedQuantities, order.preparedAssemblyQuantities);
  const batch = pb.createBatch();
  batch.collection(COLLECTION).update(id, {
    status: 'returned',
    returnedBy: actor.id,
    returnedAt,
    history: [...previousHistory(order), entry],
  });
  for (const [itemId, quantity] of Object.entries(componentQuantities)) {
    if (quantity < 1) continue;
    batch.collection(TRANSACTIONS_COLLECTION).create({
      itemId,
      transactionType: 'checkin',
      quantityChanged: quantity,
      // Keep checkout/check-in ownership balanced for the collector. The actual
      // return handler is retained on the order and in its append-only history.
      userId: order.pickedUpBy,
      factionOrderId: id,
      reason: `Faction order return: ${order.eventType} / ${order.faction}`,
      notes: [`Returned by ${actor.name}`, order.notes].filter(Boolean).join(' · '),
      timestamp: returnedAt,
    });
  }
  const [updated] = await batch.send();
  return getFactionOrder(String(updated.body.id ?? id));
}

export async function cancelFactionOrder(id: string): Promise<FactionOrder> {
  const order = await getFactionOrder(id);
  const access = await currentAccess();
  if (!access.manager && order.createdBy !== currentActor().id) throw new Error('Faction leaders can only cancel their own orders');
  const cancellable: FactionOrderStatus[] = ['draft', 'submitted', 'preparing', 'ready'];
  if (!cancellable.includes(order.status)) throw new Error('This order list can no longer be cancelled');
  const entry = historyEntry('cancelled');
  return pb.collection(COLLECTION).update<FactionOrder>(id, {
    status: 'cancelled',
    history: [...previousHistory(order), entry],
  }, { expand: EXPAND });
}

export function subscribeToFactionOrders(callback: () => void) {
  let disposed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  pb.collection(COLLECTION).subscribe<FactionOrder>('*', callback).then((cleanup) => {
    if (disposed) void cleanup();
    else unsubscribe = cleanup;
  }).catch((error) => console.warn(`Failed to subscribe to ${COLLECTION}:`, error));
  return () => {
    disposed = true;
    void unsubscribe?.();
  };
}
