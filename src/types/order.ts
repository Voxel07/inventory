import type { User } from './user';

export interface GeneralOrder {
  id: string;
  name: string;
  purpose: string;
  createdBy: string;
  created: string;
  updated: string;
  expand?: { createdBy?: User };
}

export interface GeneralOrderFormData {
  name: string;
  purpose: string;
}
