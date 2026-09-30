/** Convert form/CSV fields at the transport boundary; never cast a generic record to a DTO. */
export type InputValues = Record<string, unknown>;
export const optionalText = (value: unknown): string | null => value == null || value === '' ? null : String(value);
export function inputText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Required text field is missing');
  return value;
}
export function inputNumber(value: unknown, fallback?: number): number {
  if (value == null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error('Required numeric field is missing');
  }
  if (typeof value === 'boolean' || !Number.isFinite(Number(value))) throw new Error('Invalid numeric field');
  return Number(value);
}
export const optionalNumber = (value: unknown): number | null => value == null || value === '' ? null : inputNumber(value);
export const inputBoolean = (value: unknown): boolean => value === true || value === 'true';
export function inputChoice<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  const choice = choices.find((candidate) => candidate === value);
  if (!choice) throw new Error(`Invalid choice: ${String(value)}`);
  return choice;
}
export function inputRows(value: unknown): InputValues[] {
  if (!Array.isArray(value)) throw new Error('Required input rows are missing');
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid input row');
    return entry as InputValues;
  });
}
export function inputStrings(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new Error('Invalid text list');
  return value;
}
