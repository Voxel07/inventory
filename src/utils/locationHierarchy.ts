import type { StorageLocation } from '../types';

export function locationPath(location: StorageLocation, locations: StorageLocation[]): string {
  const names: string[] = []; const visited = new Set<string>();
  let current: StorageLocation | undefined = location;
  while (current && !visited.has(current.id)) {
    visited.add(current.id); names.unshift(current.name);
    current = locations.find((entry) => entry.id === current?.parentLocationId);
  }
  if (location.warehouseName) names.unshift(location.warehouseName);
  return names.join(' / ');
}

export function isDescendant(location: StorageLocation, ancestorId: string, locations: StorageLocation[]): boolean {
  const visited = new Set<string>(); let current: StorageLocation | undefined = location;
  while (current && !visited.has(current.id)) {
    if (current.id === ancestorId) return true;
    visited.add(current.id); current = locations.find((entry) => entry.id === current?.parentLocationId);
  }
  return false;
}
