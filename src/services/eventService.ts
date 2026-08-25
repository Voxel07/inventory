import pb from './pocketbaseClient';
import type { EventReport, EventReportFormData, EventType } from '../types';

const COLLECTION = 'inventory_event_reports';

export async function getEventReports(eventType?: EventType): Promise<EventReport[]> {
  return pb.collection(COLLECTION).getFullList<EventReport>({
    sort: '-eventDate,-created',
    filter: eventType ? pb.filter('eventType = {:eventType}', { eventType }) : undefined,
    expand: 'itemIds',
  });
}

export async function createEventReport(data: EventReportFormData): Promise<EventReport> {
  const createdBy = pb.authStore.record?.id;
  if (!createdBy) throw new Error('Authentication required');
  return pb.collection(COLLECTION).create<EventReport>({ ...data, createdBy });
}

export function subscribeToEventReports(callback: () => void) {
  let disposed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  pb.collection(COLLECTION).subscribe<EventReport>('*', callback).then((cleanup) => {
    if (disposed) void cleanup();
    else unsubscribe = cleanup;
  }).catch((error) => console.warn(`Failed to subscribe to ${COLLECTION}:`, error));
  return () => {
    disposed = true;
    void unsubscribe?.();
  };
}
