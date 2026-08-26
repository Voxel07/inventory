export interface User {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: UserRole;
  created: string;
  updated: string;
}

export type UserRole = 'admin' | 'manager' | 'user';
