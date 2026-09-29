import type { Values } from '../components/operations/OperationForm';

export function optionalValues(values: Values): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]));
}

