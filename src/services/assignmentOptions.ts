import { apiPage } from './apiClient';
import { mapPage } from './apiPagination';
import { OPEN_DAMAGE_STATUSES } from '../types/damageReport';
import type { ActorSummary, DamageReport } from '../types';
import type { Vendor } from './procurementService';

export const personOptions = async (search: string, page: number, size: number) =>
  mapPage(await apiPage<ActorSummary>('/api/users/assignable', page, size, { query: { search } }),
    person => ({ value: person.id, label: person.name || person.id }));
/** Location keepers are faction leaders or higher; the server filters, so paging stays exact. */
export const keeperOptions = async (search: string, page: number, size: number) =>
  mapPage(await apiPage<ActorSummary>('/api/users/assignable', page, size, { query: { search, minRole: 'faction_leader' } }),
    person => ({ value: person.id, label: person.name || person.id }));
export const vendorOptions = async (search: string, page: number, size: number) => {
  const result = await apiPage<Vendor>('/api/vendors', page, size, { query: { search } });
  return mapPage({ ...result, rows: result.rows.filter(vendor => vendor.active) }, vendor => ({ value: vendor.id, label: vendor.name }));
};
export const damageOptions = async (search: string, page: number, size: number) =>
  mapPage(await apiPage<DamageReport>('/api/damage-reports', page, size, { query: { search, status: OPEN_DAMAGE_STATUSES } }),
    report => ({ value: report.id, label: `${report.itemName ?? report.assemblyName ?? ''} ${report.assetCode ?? ''} · ${report.description}` }));
