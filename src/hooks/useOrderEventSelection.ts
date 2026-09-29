import { useState } from 'react';
import { useUIStore } from '../store/uiStore';
import type { EventReport, EventType } from '../types';

/** Default to the same planned occurrence as the Events page, including after a sidebar change. */
export function useOrderEventSelection(events: EventReport[]) {
  const eventType = useUIStore((state) => state.activeEventType);
  const [selection, setSelection] = useState<{ eventType: EventType; id: string } | null>(null);
  const eventOptions = events.filter((event) => event.eventType === eventType);
  const currentEvent = eventOptions.find((event) => event.status === 'planned') ?? eventOptions[0];
  const selectedEventId = selection?.eventType === eventType ? selection.id : currentEvent?.id ?? '';

  return {
    currentEvent,
    eventOptions,
    selectedEventId,
    setSelectedEventId: (id: string) => setSelection({ eventType, id }),
  };
}
