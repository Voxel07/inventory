import { translate } from './naming';
import type { ItemRequestStatus, OrderItemRequest, OrderItemRequestInput } from '../types';

/** One editor row: a new request, or an existing one that stays read-only once procurement handled it. */
export type ItemRequestDraft = { key: string; id?: string; name: string; quantity: string; link: string; note: string; request?: OrderItemRequest };

export const isHttpLink = (value: string) => /^https?:\/\/\S+$/i.test(value.trim());

export function toItemRequestDrafts(requests: readonly OrderItemRequest[] = []): ItemRequestDraft[] {
  return requests.map((request) => ({ key: request.id, id: request.id, name: request.name, quantity: String(request.quantity),
    link: request.link ?? '', note: request.note ?? '', request }));
}

export function toItemRequestInputs(drafts: readonly ItemRequestDraft[]): OrderItemRequestInput[] {
  return drafts.map((draft) => ({ id: draft.id, name: draft.name.trim(), quantity: Math.max(1, Number(draft.quantity) || 1),
    link: draft.link.trim() || undefined, note: draft.note.trim() || undefined }));
}

export function itemRequestStatusLabel(status: ItemRequestStatus) {
  const labels = { open: 'itemRequests.statusOpen', item_created: 'itemRequests.statusItemCreated', ordered: 'itemRequests.statusOrdered',
    received: 'itemRequests.statusReceived', declined: 'itemRequests.statusDeclined' } as const;
  return translate(labels[status]);
}
