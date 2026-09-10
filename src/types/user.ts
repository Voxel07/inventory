export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: UserRole;
  faction?: string[];
  created: string;
  updated: string;
}

export type UserRole = 'admin' | 'inventory_manager' | 'warehouse_packer' | 'faction_leader'
  | 'hq_admin' | 'warehouse_crew' | 'marshal' | 'event_planner' | 'maintenance_crew' | 'read_only';

export type AccessRole = UserRole;

export interface UserPermissionsFormData {
  role: AccessRole;
  faction: string[];
}
