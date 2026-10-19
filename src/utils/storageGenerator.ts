/** "Regal" 1–4, each with "Fach" 1–8: numbered storage places, optionally with numbered sub-places. */
export interface StorageGeneratorSpec {
  prefix: string;
  from: number;
  to: number;
  childPrefix?: string;
  childFrom?: number;
  childTo?: number;
}

export interface GeneratedNode {
  name: string;
  children: GeneratedNode[];
}

/** Upper bound for one generation, so a typo (1–800) does not create hundreds of places at once. */
export const MAX_GENERATED_PLACES = 500;

function range(from: number, to: number): number[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) return [];
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

function numbered(prefix: string, value: number): string {
  const name = prefix.trim();
  return name ? `${name} ${value}` : String(value);
}

export function hasChildLevel(spec: StorageGeneratorSpec): boolean {
  return Boolean(spec.childPrefix?.trim()) || spec.childFrom != null || spec.childTo != null;
}

/** Number of places the spec creates (parents plus their sub-places). */
export function generatedCount(spec: StorageGeneratorSpec): number {
  const parents = range(spec.from, spec.to).length;
  if (!hasChildLevel(spec)) return parents;
  return parents + parents * range(spec.childFrom ?? 1, spec.childTo ?? 0).length;
}

export function generateStoragePlaces(spec: StorageGeneratorSpec): GeneratedNode[] {
  const children = hasChildLevel(spec) ? range(spec.childFrom ?? 1, spec.childTo ?? 0) : [];
  return range(spec.from, spec.to).map((value) => ({
    name: numbered(spec.prefix, value),
    children: children.map((child) => ({ name: numbered(spec.childPrefix ?? '', child), children: [] })),
  }));
}
