import { useSearchParams } from 'react-router-dom';
import { useEventReports } from './useEvents';
import { useUIStore } from '../store/uiStore';

export function useEventWorkspace() {
  const query = useEventReports();
  const [params, setParams] = useSearchParams();
  const activeEventType = useUIStore((state) => state.activeEventType);
  const reports = query.data ?? [];
  const requestedId = params.get('eventId');
  const event = requestedId ? reports.find((report) => report.id === requestedId)
    : reports.find((report) => report.eventType === activeEventType && report.status === 'planned')
      ?? reports.find((report) => report.status === 'planned') ?? reports[0];

  function selectEvent(id: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('eventId', id);
      return next;
    });
  }

  return { event, reports, selectEvent, requestedId, query };
}
