import type { EventType, FactionOrder } from '../types';

function hasValues(values: Record<string, number> | undefined): values is Record<string, number> {
  return Boolean(values && Object.keys(values).length);
}

export function factionOrderItemBaseline(order: FactionOrder): Record<string, number> {
  if (['picked_up', 'returned'].includes(order.status) && hasValues(order.preparedQuantities)) {
    return order.preparedQuantities;
  }
  return order.requestedQuantities;
}

export function factionOrderAssemblyBaseline(order: FactionOrder): Record<string, number> {
  if (['picked_up', 'returned'].includes(order.status) && hasValues(order.preparedAssemblyQuantities)) {
    return order.preparedAssemblyQuantities;
  }
  return order.requestedAssemblyQuantities ?? {};
}

export function findPreviousFactionOrder(
  orders: FactionOrder[],
  values: { eventType: EventType; faction: string; eventDate: string; excludeId?: string },
): FactionOrder | undefined {
  const targetTime = new Date(values.eventDate).getTime();
  if (!Number.isFinite(targetTime)) return undefined;
  const targetYear = new Date(values.eventDate).getUTCFullYear();
  const candidates = orders
    .filter((order) => (
      order.id !== values.excludeId
      && order.eventType === values.eventType
      && order.faction === values.faction
      && order.status !== 'cancelled'
      && new Date(order.eventDate).getTime() < targetTime
    ))
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  return candidates.find((order) => new Date(order.eventDate).getUTCFullYear() === targetYear - 1)
    ?? candidates.find((order) => new Date(order.eventDate).getUTCFullYear() < targetYear);
}
