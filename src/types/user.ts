export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: UserRole;
  /** Faction memberships as `EVENT:slug` keys, mirrored from the identity provider's groups. */
  faction?: string[];
  created: string;
  updated: string;
}

export type UserRole = 'hq_admin' | 'warehouse_crew' | 'marshal' | 'event_planner'
  | 'maintenance_crew' | 'faction_leader' | 'read_only';

export type AccessRole = UserRole;

