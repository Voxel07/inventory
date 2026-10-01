export type ApiChangeDetail = {
  type?: string; resource?: string; id?: string; itemId?: string; orderId?: string;
  eventId?: string; idempotencyKey?: string; status?: string; quantity?: unknown;
  source?: 'local' | 'server'; changes?: ApiChangeDetail[];
};

type LocalChangeType = 'catalog.changed' | 'equipment.changed' | 'asset.updated' | 'order.changed'
  | 'general_order.changed' | 'stock.changed' | 'return.changed' | 'damage.updated' | 'maintenance.recorded'
  | 'maintenance_schedule.changed' | 'repair.changed' | 'transfer.changed' | 'count.changed' | 'inventory_lot.changed'
  | 'inventory_code.changed' | 'warehouse.changed' | 'vendor.changed' | 'purchase_order.changed' | 'goods_receipt.posted'
  | 'vendor_document.attached' | 'loan.changed' | 'planning.overridden' | 'report.rebuilt' | 'reminder.changed'
  | 'access.changed' | 'notification.read' | 'user.changed' | 'location.keeper_assigned' | 'member_request.changed' | 'outbox.changed' | 'unknown';
type LocalWriteChange = ApiChangeDetail & { source: 'local'; type: LocalChangeType };

/** Local commands use the same vocabulary and consumer map as outbox events. */
export function localWriteChange(path: string): LocalWriteChange {
  const [, resource, id, action] = path.split('/').filter(Boolean);
  const change = (type: LocalChangeType): LocalWriteChange => ({ type, resource, id, source: 'local' });
  switch (resource) {
    case 'access': return change('access.changed');
    case 'items': return change(action === 'equipment' ? 'equipment.changed' : action === 'assets' ? 'asset.updated' : 'catalog.changed');
    case 'assemblies': case 'storage-locations': case 'events': case 'factions': case 'category-maintenance': return change('catalog.changed');
    case 'orders': return change('order.changed');
    case 'general-orders': return change('general_order.changed');
    case 'transactions': return change('stock.changed');
    case 'returns': return change('return.changed');
    case 'damage-reports': return change('damage.updated');
    case 'maintenance': return change('maintenance.recorded');
    case 'maintenance-schedules': return change('maintenance_schedule.changed');
    case 'repairs': return change('repair.changed');
    case 'transfers': return change('transfer.changed');
    case 'inventory-counts': return change('count.changed');
    case 'inventory-lots': return change('inventory_lot.changed');
    case 'inventory-codes': return change('inventory_code.changed');
    case 'warehouses': return change('warehouse.changed');
    case 'vendors': return change('vendor.changed');
    case 'purchase-orders': return change('purchase_order.changed');
    case 'goods-receipts': return change('goods_receipt.posted');
    case 'vendor-documents': return change('vendor_document.attached');
    case 'loans': return change('loan.changed');
    case 'procurement': return change('planning.overridden');
    case 'reports': return change('report.rebuilt');
    case 'action-inbox': return change('reminder.changed');
    case 'notifications': return change('notification.read');
    case 'users': return change('user.changed');
    case 'member': return change(id === 'returns' ? 'return.changed' : id === 'assignments' ? 'location.keeper_assigned' : 'member_request.changed');
    case 'outbox': return change('outbox.changed');
    default: return change('unknown');
  }
}

const custody = ['custody-balances', 'member-custody', 'member-storage', 'member-requests', 'return-submissions'];
const stock = ['items', 'assemblies', 'transactions', 'damageReports', 'maintenance', 'faction-orders', 'general-orders',
  'event-reports', 'procurement-deficits', 'loans', 'action-inbox', 'reports', 'notifications', ...custody,
  'operations:positions', 'operations:storage-positions', 'operations:assets', 'operations:storage-assets',
  'operations:counts', 'operations:lots', 'operations:transaction-lots', 'operations:stock-lot-labels', 'operations:schedules', 'operations:repairs'];
const purchasing = ['purchase-orders', 'procurement-deficits', 'reports', 'action-inbox', 'operations:purchases', 'operations:receipts', 'operations:document-receipts'];

/** null means unknown: preserve conservative invalidation of every reader. */
export function affectedDomains(detail?: ApiChangeDetail): ReadonlySet<string> | null {
  if (!detail?.type) return null;
  if (detail.type === 'batch') {
    const domains = new Set<string>();
    for (const change of detail.changes ?? []) {
      const affected = affectedDomains(change);
      if (!affected) return null;
      affected.forEach(domain => domains.add(domain));
    }
    return domains;
  }
  const type = detail.type;
  if (type === 'catalog.changed') {
    switch (detail.resource) {
      case 'items': return new Set([...stock, 'member-assignments']);
      case 'assemblies': return new Set(['assemblies', 'faction-orders', 'procurement-deficits', 'action-inbox', 'reports']);
      case 'storage-locations': return new Set([...stock, 'storageLocations', 'member-assignments', 'operations:warehouses', 'operations:transfers']);
      case 'events': return new Set(['event-reports', 'faction-orders', 'general-orders', 'procurement-deficits', 'items', 'action-inbox', 'reports', 'loans', ...custody]);
      case 'factions': return new Set(['factions', 'faction-orders', 'event-reports', 'action-inbox', 'reports']);
      case 'category-maintenance': return new Set([...stock, 'category-maintenance']);
      default: return null;
    }
  }
  if (type === 'reminder.changed') return new Set(['action-inbox']);
  if (type === 'notification.read') return new Set(['notifications']);
  if (type === 'report.rebuilt') return new Set(['reports']);
  if (type === 'user.changed') return new Set(['users', 'items', 'storageLocations', 'general-orders', 'faction-orders', 'member-assignments', ...custody, 'reports', 'action-inbox']);
  if (type === 'planning.overridden') return new Set(['procurement-deficits', 'action-inbox']);
  if (type.startsWith('vendor_document.')) return new Set(['operations:documents']);
  if (type.startsWith('vendor.')) return new Set([...purchasing, 'operations:vendors', 'operations:repair-vendors', 'operations:repairs']);
  if (type.startsWith('purchase_order.')) return new Set([...purchasing, 'items']);
  if (type.startsWith('goods_receipt.')) return new Set([...stock, ...purchasing]);
  if (type.startsWith('inventory_code.')) return new Set(['operations:codes']);
  if (type.startsWith('warehouse.')) return new Set(['storageLocations', 'items', 'assemblies', 'member-storage', 'member-assignments', 'reports', 'operations:warehouses', 'operations:positions', 'operations:storage-positions', 'operations:assets', 'operations:storage-assets']);
  if (type === 'location.keeper_assigned') return new Set(['storageLocations', 'member-assignments', 'member-storage', 'action-inbox']);
  if (type.startsWith('outbox.')) return new Set(['operations:outbox', 'operations:dead-letters']);
  if (type === 'sync.completed') return new Set([...stock, 'operations:sync-audit', 'operations:my-sync-audit', 'offline-cache-freshness']);
  if (type.startsWith('transfer.')) return new Set([...stock, 'operations:transfers']);
  if (type.startsWith('count.')) return new Set([...stock, 'operations:counts']);
  if (type.startsWith('equipment.') || type.startsWith('loan.')) return new Set([...stock, 'operations:transfers']);
  if (type === 'stock.changed' || type.startsWith('order.') || type.startsWith('general_order.') || type.startsWith('return.')
    || type.startsWith('asset.') || type.startsWith('damage.') || type.startsWith('repair.') || type.startsWith('maintenance.')
    || type.startsWith('maintenance_schedule.') || type.startsWith('inventory_lot.') || type.startsWith('member_request.')) return new Set(stock);
  return null;
}

export function domainForQuery(key: readonly unknown[]): string {
  return key[0] === 'operations' ? `operations:${String(key[1]).split(':')[0]}` : String(key[0]);
}
