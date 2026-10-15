import type { Item } from './item';

/** Values of the generic operation forms; field types live here so services need no UI import. */
export type Values = Record<string, string | number | boolean>;
export type Option = { value: string; label: string };
/**
 * `type: 'item'` renders a server-search item picker (the catalog is never loaded into options);
 * `itemFilter` narrows its matches.
 */
export type Field = {
  key: string; label: string; type?: 'number' | 'date' | 'datetime-local' | 'checkbox' | 'text' | 'item'; required?: boolean;
  min?: number; max?: number; step?: number; options?: Option[]; multiline?: boolean; help?: string; reset?: Values;
  itemFilter?: (item: Item) => boolean;
};
