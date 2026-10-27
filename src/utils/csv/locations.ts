import type { StorageLocation } from '../../types';

/** `Betriebshof / Regal 3`, `Betriebshof > Regal 3` and `Betriebshof\Regal 3` all name the same path. */
const PATH_SEPARATOR = /\s*(?:\/|>|\\)\s*/;

function locationPathSegments(value: string): string[] {
  return value.split(PATH_SEPARATOR).map((segment) => segment.trim()).filter(Boolean);
}

export function normalizeLocationRef(value: string): string {
  return locationPathSegments(value).join(' / ').toLowerCase();
}

/**
 * Lookup keys of every location: id, full code (`BH-L-R3`), full path and, when unique, the bare name.
 * Ambiguous names map to `null` so that the CSV has to name the location by code or path.
 */
export function buildLocationIndex(locations: StorageLocation[]): Map<string, StorageLocation | null> {
  const index = new Map<string, StorageLocation | null>();
  const names = new Map<string, StorageLocation | null>();
  for (const location of locations) {
    index.set(location.id.toLowerCase(), location);
    if (location.fullCode) index.set(location.fullCode.toLowerCase(), location);
    if (location.hierarchyPath) index.set(normalizeLocationRef(location.hierarchyPath), location);
    const name = location.name.trim().toLowerCase();
    names.set(name, names.has(name) ? null : location);
  }
  for (const [name, location] of names) if (!index.has(name)) index.set(name, location);
  return index;
}

type CsvLocationMatch =
  | { kind: 'found'; location: StorageLocation }
  | { kind: 'ambiguous'; name: string }
  | { kind: 'missing'; segments: string[] };

export function resolveCsvLocation(value: string, index: Map<string, StorageLocation | null>): CsvLocationMatch {
  const key = normalizeLocationRef(value);
  const direct = index.get(key) ?? index.get(value.trim().toLowerCase());
  if (direct) return { kind: 'found', location: direct };
  if (direct === null) return { kind: 'ambiguous', name: value.trim() };
  return { kind: 'missing', segments: locationPathSegments(value) };
}
