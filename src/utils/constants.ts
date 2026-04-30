export const COLLECTIONS = {
  ITEMS: 'inventory_items',
  ASSEMBLIES: 'inventory_assemblies',
  STOCK_TRANSACTIONS: 'inventory_stock_transactions',
  DAMAGE_REPORTS: 'inventory_damage_reports',
  USERS: 'inventory_users',
} as const;

export const TRANSACTION_REASONS = [
  'Project use',
  'Maintenance',
  'Testing',
  'Return after use',
  'Inventory correction',
  'Other',
] as const;

export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export const DAMAGE_STATUSES = ['reported', 'in_review', 'resolved', 'written_off'] as const;

export const ITEM_STATUSES = ['available', 'checked_out', 'damaged', 'retired'] as const;
