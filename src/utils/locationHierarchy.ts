import type { StorageLocation } from '../types';

type LocationRole = 'location' | 'section' | 'place';

/** Location (site, holds no stock) → section → storage places, which may nest (shelf → compartment). */
export function locationRole(location: Pick<StorageLocation, 'depth'>): LocationRole {
  return location.depth === 0 ? 'location' : location.depth === 1 ? 'section' : 'place';
}

/** Stock lives in sections and storage places, never directly in a top-level location. */
export function holdsStock(location: Pick<StorageLocation, 'depth'>): boolean {
  return location.depth === null || location.depth > 0;
}

export function locationPath(location: StorageLocation, locations: StorageLocation[]): string {
  if (location.hierarchyPath) return location.hierarchyPath;
  const names: string[] = []; const visited = new Set<string>();
  let current: StorageLocation | undefined = location;
  while (current && !visited.has(current.id)) {
    visited.add(current.id); names.unshift(current.name);
    current = locations.find((entry) => entry.id === current?.parentLocationId);
  }
  return names.join(' / ');
}

/** "BH-CE-R3 · Betriebshof / Container Elektronik / Regal 3": the code identifies, the path explains. */
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

export interface LocationTreeNode {
  location: StorageLocation;
  children: LocationTreeNode[];
}

const byCode = (a: LocationTreeNode, b: LocationTreeNode) =>
  a.location.code.localeCompare(b.location.code, undefined, { numeric: true }) || a.location.name.localeCompare(b.location.name);

/** Nests a flat location list; locations whose parent is not in the list become roots. */
export function buildLocationTree(locations: StorageLocation[]): LocationTreeNode[] {
  const nodes = new Map(locations.map((location) => [location.id, { location, children: [] as LocationTreeNode[] }]));
  const roots: LocationTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.location.parentLocationId ? nodes.get(node.location.parentLocationId) : undefined;
    if (parent && parent !== node) parent.children.push(node); else roots.push(node);
  }
  const sort = (list: LocationTreeNode[]) => { list.sort(byCode); list.forEach((node) => sort(node.children)); };
  sort(roots);
  return roots;
}

/** Keeps the nodes matching `matches` together with their ancestors (for context) and descendants. */
export function filterLocationTree(tree: LocationTreeNode[], matches: (location: StorageLocation) => boolean): LocationTreeNode[] {
  return tree.flatMap((node) => {
    if (matches(node.location)) return [node];
    const children = filterLocationTree(node.children, matches);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

/** Every location in `node`'s subtree, the node itself first. */
export function flattenLocationTree(node: LocationTreeNode): StorageLocation[] {
  return [node.location, ...node.children.flatMap(flattenLocationTree)];
}
