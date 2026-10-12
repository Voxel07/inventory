/** Wall-clock times at the event; deliberately have no timezone suffix. */
export interface EventAttendeeInput {
  name: string;
  role: string;
  arrivesAt: string | null;
  leavesAt: string | null;
  foodStampsIssued: boolean;
  notes: string;
}

export interface EventAttendee extends Omit<EventAttendeeInput, 'notes'> {
  id: string;
  eventId: string;
  mainMealStamps: number;
  breakfastStamps: number;
  notes: string | null;
}

export type TimelineCategory = 'in_game' | 'preparation';
export type TimelineStatus = 'planned' | 'in_progress' | 'completed';

export interface EventTimelineInput {
  category: TimelineCategory;
  title: string;
  startsAt: string;
  endsAt: string | null;
  owner: string;
  location: string;
  status: TimelineStatus;
  description: string;
}

export interface EventTimelineEntry extends Omit<EventTimelineInput, 'owner' | 'location' | 'description'> {
  id: string;
  eventId: string;
  owner: string | null;
  location: string | null;
  description: string | null;
}
