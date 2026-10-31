/** Display attribution; account details and permissions are never embedded in operational responses. */
export type ActorSummary = Pick<User, 'id' | 'name'>;

/** The phone bars a destination can be placed in; destinations in neither stay in the "More" menu. */
export type MobileNavPlacement = 'bottom' | 'top';
/** Phone navigation chosen by the user. Keys are `tasks`, `scanner` or a route path. */
export interface MobileNavLayout {
  /** Bottom-bar destinations, left to right. */
  bottom: string[];
  /** Top-bar destinations, left to right. */
  top: string[];
  /** Destinations left out of the bars and the "More" menu. */
  hidden: string[];
  /** The profile button also opens the inbox, so Tasks needs no place of its own. */
  inboxInProfile: boolean;
}

export interface User {
  active: boolean;
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Independently assigned roles; role is the highest effective role. */
  roles: UserRole[];
  /** Faction memberships as `EVENT:slug` keys, set by the inventory admin. */
  faction?: string[];
  /** Revision of role and factions; required when the admin changes them. */
  revision?: number;
  created: number;
  updated: number;
  /** Only on the signed-in user; absent while the default layout applies. */
  mobileNavigation?: MobileNavLayout;
}

/**
 * Role ladder from least to most privileged; every role includes the rights of the roles before it.
 * Authentik only grants access to the system; the inventory admin assigns roles in the app. The highest role determines access.
 */
export const ROLE_LADDER = ['tenant', 'read_only', 'faction_leader', 'ash', 'warehouse_crew', 'admin'] as const;

export type UserRole = typeof ROLE_LADDER[number];

export type AccessRole = UserRole;

export interface UserAccessState {
  roles: UserRole[];
  factions: string[];
}

export interface UserAccessHistoryEntry {
  id: string;
  occurredAt: number;
  changedBy: ActorSummary | null;
  before: UserAccessState;
  after: UserAccessState;
  reason: string;
}
