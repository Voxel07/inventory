import { useQuery } from '@tanstack/react-query';
import { getItemRequestQueue } from '../services/procurementService';

/** Requests of live orders in the scope; without `includeResolved` only those still waiting for procurement. */
export function useItemRequestQueue(eventId: string, includeResolved = false) {
  return useQuery({
    queryKey: ['procurement-item-requests', eventId, includeResolved],
    queryFn: () => getItemRequestQueue(eventId || undefined, includeResolved),
  });
}
