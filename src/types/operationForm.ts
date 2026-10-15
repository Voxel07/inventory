import type { Item } from './item';
import type { Page } from '../services/apiPagination';

/** Values of the generic operation forms; field types live here so services need no UI import. */
export type Values = Record<string, string | number | boolean>;
export type Option = { value: string; label: string };
/**
 * `type: 'item'` renders a server-search item picker (the catalog is never loaded into options);
 * `itemFilter` narrows its matches. `type: 'dateRange'` edits `key` (start) and `endKey` (end) in one connected picker.
 */
export type Field = {
  key: string; label: string; type?: 'number' | 'date' | 'datetime-local' | 'dateRange' | 'checkbox' | 'text' | 'item'; required?: boolean;
  endKey?: string; endLabel?: string;
  min?: number; max?: number; step?: number; options?: Option[]; multiline?: boolean; help?: string; reset?: Values;
  itemFilter?: (item: Item) => boolean;
  pagedOptions?: { queryKey: readonly unknown[]; getPage: (search: string, page: number, size: number) => Promise<Page<Option>>; selectedLabel?: string };
};
