import { apiRequest } from './apiClient';
import type { OrderKind, OrderPreparationInput, OrderRestockInput, OrderReturnInput, OrderStatus, OrderTransitionInput } from '../types/orderCommands';

export const orderPath = (kind: OrderKind, id?: string) => `/api/orders/${kind}${id ? `/${id}` : ''}`;

export function prepareOrder<T>(kind: OrderKind, id: string, data: OrderPreparationInput): Promise<T> {
  const input = { ...data, idempotencyKey: data.idempotencyKey ?? crypto.randomUUID() };
  return apiRequest(`${orderPath(kind, id)}/prepare`, {
    method: 'POST', body: input,
    offline: { type: 'order.prepare', payload: { orderId: id, input }, idempotencyKey: input.idempotencyKey },
  });
}

export function changeOrderStatus<T>(kind: OrderKind, id: string, status: OrderStatus, data: OrderTransitionInput = {}): Promise<T> {
  const body = { ...data, idempotencyKey: data.idempotencyKey ?? crypto.randomUUID() };
  return apiRequest(`${orderPath(kind, id)}/transitions/${status}`, {
    method: 'POST', body,
    offline: { type: 'order.transition', payload: { orderId: id, status, ...body }, idempotencyKey: body.idempotencyKey },
  });
}

export function reconcileOrder<T>(kind: OrderKind, id: string, data: OrderReturnInput): Promise<T> {
  const input = { ...data, idempotencyKey: data.idempotencyKey ?? crypto.randomUUID() };
  return apiRequest(`${orderPath(kind, id)}/return`, {
    method: 'POST', body: input,
    offline: { type: 'order.return', payload: { orderId: id, input }, idempotencyKey: input.idempotencyKey },
  });
}

/** Online only: the cumulative limit is checked against what the server still books as consumed. */
export function restockOrder<T>(kind: OrderKind, id: string, data: OrderRestockInput): Promise<T> {
  return apiRequest(`${orderPath(kind, id)}/restock`, { method: 'POST', body: { ...data, idempotencyKey: data.idempotencyKey ?? crypto.randomUUID() } });
}
