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

export type UserRole = 'Admin ' | 'Admin' | 'User' | 'admin' | 'manager' | 'inventory_manager' | 'warehouse_packer' | 'faction_leader' | 'user' | 'banker' | 'player';

export type AccessRole = 'admin' | 'inventory_manager' | 'warehouse_packer' | 'faction_leader';

export interface UserPermissionsFormData {
  role: AccessRole;
  faction: string[];
}
