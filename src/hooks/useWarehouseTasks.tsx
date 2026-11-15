import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from './useDebouncedValue';
import { useT } from '../utils/naming';
import { formatStatus } from '../utils/formatters';
import { ListPagination } from '../components/shared/ListPagination';

type Options = { value: string; label: string }[];
export type TaskFilter = { key: string; label: string; options: Options };

export function taskStatusFilter(t: ReturnType<typeof useT>, statuses: string[], workQueue = true): TaskFilter {
  return { key: 'status', label: t('common.status'), options: [
    ...(workQueue ? [{ value: 'open', label: t('operations.tasks.open') }] : []),
    { value: '', label: t('operations.tasks.allStatuses') },
    ...statuses.map(value => ({ value, label: formatStatus(value) })),
    ...(workQueue ? [{ value: 'history', label: t('operations.tasks.history') }] : []),
  ] };
}

/** Each queue keeps its own filters in the URL, including when switching tabs or opening a record. */
export function useTaskFilters(scope: string, defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();
  const keys = ['search', 'status', 'locationId', 'vendorId', 'eventId', 'kind'];
  const values = Object.fromEntries(keys.map(key => [key, params.get(`${scope}.${key}`) ?? defaults[key] ?? '']));
  const search = useDebouncedValue(values.search.trim());
  const query = Object.fromEntries(Object.entries({ ...values, search }).filter(([, value]) => value));
  const set = (key: string, value: string) => setParams(current => {
    current.set(`${scope}.${key}`, value);
    return current;
  }, { replace: true });
  const reset = () => setParams(current => {
    keys.forEach(key => current.delete(`${scope}.${key}`));
    return current;
  }, { replace: true });
  const changed = Object.entries(values).some(([key, value]) => value !== (defaults[key] ?? ''));
  return { values, query, set, reset, changed };
}

export function taskSearch(search: string, ...values: unknown[]) {
  const text = values.flat(Infinity).filter(value => value != null).join(' ').toLocaleLowerCase();
  return search.trim().toLocaleLowerCase().split(/\s+/).every(term => text.includes(term));
}

/** Bound large, complete result sets without losing matches outside the displayed page. */
export function useTaskPage<T>(rows: T[], filterKey: string) {
  const [pagination, setPagination] = useState({ key: filterKey, page: 1, size: 25 });
  const page = Math.min(pagination.key === filterKey ? pagination.page : 1, Math.max(1, Math.ceil(rows.length / pagination.size)));
  return {
    rows: rows.slice((page - 1) * pagination.size, page * pagination.size),
    control: rows.length > 0 && <ListPagination count={rows.length} page={page} pageSize={pagination.size} pageSizeOptions={[25, 50, 100]}
      onChange={next => setPagination({ ...pagination, key: filterKey, page: next })}
      onPageSizeChange={size => setPagination({ key: filterKey, page: 1, size })} />,
  };
}

