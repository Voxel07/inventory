import type { Assembly, Item } from '../types';

export function filterCatalogItems(items: Item[], search: string, category = '', eligible?: (item: Item) => boolean, byLocation = false) {
  const term = search.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => (!category || item.category === category)
    && (term ? `${item.name} ${item.category} ${item.subcategory ?? ''} ${item.sku ?? ''}`.toLocaleLowerCase().includes(term) : !eligible || eligible(item)));
  return byLocation ? [...filtered].sort((a, b) => {
    const location = (item: Item) => item.expand?.storageLocation?.name || item.storageLocation || '';
    return location(a).localeCompare(location(b)) || a.name.localeCompare(b.name);
  }) : filtered;
}

export function filterCatalogAssemblies(assemblies: Assembly[], search: string, eligible?: (assembly: Assembly) => boolean) {
  const term = search.trim().toLocaleLowerCase();
  return assemblies.filter((assembly) => term
    ? `${assembly.name} ${assembly.description ?? ''}`.toLocaleLowerCase().includes(term)
    : !eligible || eligible(assembly));
}

export function catalogPage<T>(entries: T[], requestedPage: number, size: number) {
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, Math.ceil(entries.length / size)));
  return { page, entries: entries.slice((page - 1) * size, page * size) };
}
