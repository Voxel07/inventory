/** Prefixes shared by readers and invalidation; parameterized keys retain their domain prefix. */
export const queryKeys = {
  operations: (name: string) => ['operations', name] as const,
  loans: () => ['loans'] as const,
  equipment: (itemId: string) => ['items', itemId, 'equipment'] as const,
  equipmentAvailability: (eventId?: string) => ['items', 'equipment-availability', eventId] as const,
  inbox: (userId?: string) => ['action-inbox', userId] as const,
  member: (kind: 'custody' | 'storage' | 'requests', userId?: string) => [`member-${kind}`, userId] as const,
  memberAssignments: () => ['member-assignments'] as const,
  reportDefinitions: () => ['reports', 'definitions'] as const,
  report: (name: string, filters: object, page: number) => ['reports', name, filters, page] as const,
};

/** Stock and custody commands also affect planning, notifications and report projections. */
export const stockQueryPrefixes = [
  'reports', 'operations', 'items', 'assemblies', 'storageLocations', 'transactions', 'damageReports', 'maintenance',
  'custody-balances', 'member-custody', 'member-storage', 'member-requests', 'action-inbox', 'loans',
  'faction-orders', 'general-orders', 'event-reports', 'procurement-deficits', 'purchase-orders', 'return-submissions', 'notifications',
] as const;
