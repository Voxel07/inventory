export type QuantityInputs = Record<string, string>;

export function toQuantityInputs(values: Record<string, number> | undefined): QuantityInputs {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([id, value]) => [id, String(value)]),
  );
}

export function toNonNegativeQuantities(values: QuantityInputs): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([id, value]) => [id, Number(value)] as const)
      .filter(([, value]) => Number.isFinite(value) && value >= 0),
  );
}

export function toPositiveIntegerQuantities(values: QuantityInputs): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([id, value]) => [id, Number(value)] as const)
      .filter(([, value]) => Number.isInteger(value) && value > 0),
  );
}
