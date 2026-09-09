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

export type UserRole = 'Admin ' | 'inventory_manager' | 'warehouse_packer' | 'faction_leader';

export type AccessRole = 'admin' | 'inventory_manager' | 'warehouse_packer' | 'faction_leader';

export interface UserPermissionsFormData {
  role: AccessRole;
  faction: string[];
}
