import type { Values } from '../types/operationForm';

/** A generic form value that must be one of `allowed`; rejects anything else instead of casting it. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`Unexpected value "${String(value)}"; expected one of ${allowed.join(', ')}`);
  return match;
}

export function optionalValues(values: Values): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]));
}

