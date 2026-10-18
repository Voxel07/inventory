import type { StorageLocation } from '../types';

export function locationPath(location: StorageLocation, locations: StorageLocation[]): string {
  if (location.hierarchyPath) return location.hierarchyPath;
  const names: string[] = []; const visited = new Set<string>();
  let current: StorageLocation | undefined = location;
  while (current && !visited.has(current.id)) {
    visited.add(current.id); names.unshift(current.name);
    current = locations.find((entry) => entry.id === current?.parentLocationId);
  }
  if (location.warehouseName) names.unshift(location.warehouseName);
  return names.join(' / ');
}

/** "WH1-E1-R3 · Warehouse 1 / Electronics 1 / Shelf 3": the code identifies, the path explains. */
export function locationLabel(location: StorageLocation | null | undefined, locations: StorageLocation[] = []): string {
  if (!location) return '';
  const path = locationPath(location, locations);
  return location.fullCode ? `${location.fullCode} · ${path}` : path;
}

export function isDescendant(location: StorageLocation, ancestorId: string, locations: StorageLocation[]): boolean {
  const visited = new Set<string>(); let current: StorageLocation | undefined = location;
  while (current && !visited.has(current.id)) {
    if (current.id === ancestorId) return true;
    visited.add(current.id); current = locations.find((entry) => entry.id === current?.parentLocationId);
  }
  return false;
}
