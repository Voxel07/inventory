export type AttendeeRoleKind = 'faction_leader' | 'faction_deputy' | 'faction_hq_crew' | 'as_held' | 'event_crew';

/** Roles held for one faction of the event type; the others apply to the whole event. */
export const FACTION_ROLES: readonly AttendeeRoleKind[] = ['faction_leader', 'faction_deputy', 'faction_hq_crew'];
export const ATTENDEE_ROLES: readonly AttendeeRoleKind[] = [...FACTION_ROLES, 'as_held', 'event_crew'];

interface AttendeeRoleInput {
  role: AttendeeRoleKind;
  factionId: string | null;
  /** Work assigned to event crew. */
  assignment: string | null;
}

export interface AttendeeRole extends AttendeeRoleInput {
  factionName: string | null;
}

export interface EventPersonSummary {
  id: string;
  name: string;
  userId: string | null;
  userName: string | null;
}

export interface EventPerson extends EventPersonSummary {
  attendances: number;
}

export interface EventPersonInput {
  name: string;
  userId: string | null;
}

export interface EventAccountOption {
  id: string;
  name: string;
  linkedPersonId: string | null;
}

/**
 * Without personId a new person is created; with it the shared person is renamed/relinked,
 * which applies at every event. Times are wall-clock times at the event, without timezone suffix.
 */
export interface EventAttendeeInput {
  personId: string | null;
  personName: string;
  personUserId: string | null;
  arrivesAt: number | null;
  leavesAt: number | null;
  foodStampsIssued: boolean;
  notes: string;
  roles: AttendeeRoleInput[];
}

export interface EventAttendee {
  id: string;
  eventId: string;
  person: EventPersonSummary;
  roles: AttendeeRole[];
  arrivesAt: number | null;
  leavesAt: number | null;
  mainMealStamps: number;
  breakfastStamps: number;
  foodStampsIssued: boolean;
  notes: string | null;
}

export interface CateringSettings {
  dailyMainMealStamps: number;
  dailyBreakfastStamps: number;
  firstDayMainMealStamps: number;
}

export type TimelineCategory = 'in_game' | 'preparation' | 'catering';
export type TimelineStatus = 'planned' | 'in_progress' | 'completed';

export interface EventTimelineInput {
  category: TimelineCategory;
  title: string;
  startsAt: number;
  endsAt: number | null;
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
