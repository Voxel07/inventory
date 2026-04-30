export interface Assembly {
  id: string;
  name: string;
  itemIds: string[];
  description: string;
  created: string;
  updated: string;
}

export interface AssemblyFormData {
  name: string;
  itemIds: string[];
  description: string;
}
