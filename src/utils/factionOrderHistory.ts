import type { FactionOrderSummary } from '../types';

function hasValues(values: Record<string, number> | undefined): values is Record<string, number> {
  return Boolean(values && Object.keys(values).length);
}

export function factionOrderItemBaseline(order: FactionOrderSummary): Record<string, number> {
  if (['picked_up', 'partially_returned', 'returned', 'closed'].includes(order.status) && hasValues(order.preparedQuantities)) {
    return order.preparedQuantities;
  }
  return order.requestedQuantities;
}

export function factionOrderAssemblyBaseline(order: FactionOrderSummary): Record<string, number> {
  if (['picked_up', 'partially_returned', 'returned', 'closed'].includes(order.status) && hasValues(order.preparedAssemblyQuantities)) {
    return order.preparedAssemblyQuantities;
  }
  return order.requestedAssemblyQuantities ?? {};
}
