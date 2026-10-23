import type { Item } from '../types';
import { getAppLanguage } from '../i18n';

export interface StockCalculation {
  totalStock: number;
  checkedOut: number;
  inTransit: number;
  damaged: number;
  remaining: number;
}

export function getItemStock(item: Item | null | undefined): StockCalculation {
  if (item?.stock) {
    return {
      totalStock: item.stock.totalOwned,
      checkedOut: item.stock.checkedOut,
      inTransit: item.stock.inTransit,
      damaged: item.stock.damaged,
      remaining: item.stock.available,
    };
  }
  return { totalStock: 0, checkedOut: 0, inTransit: 0, damaged: 0, remaining: 0 };
}

type Measured = Pick<Item, 'unit' | 'quantityDecimals' | 'unitCapacity'> | null | undefined;

/**
 * Whole items use one step per unit; percentage consumables use 100 steps per full canister/bag.
 */
export function quantityScale(item: Measured): number {
  return 10 ** (item?.quantityDecimals ?? 0);
}

/** Steps → full-unit equivalents (75 percentage steps → 0.75 of a full unit). */
export function fromSteps(item: Measured, steps: number): number {
  return steps / quantityScale(item);
}

export function usesPercentage(item: Measured): boolean {
  return item?.quantityDecimals === 2;
}

/** Inputs are whole units or whole percentages of one full unit; fractional inputs are rejected. */
export function toSteps(item: Measured, value: number | string, percentage = false): number {
  const amount = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (!Number.isInteger(amount) || (percentage && !usesPercentage(item))) return Number.NaN;
  return amount * (percentage ? 1 : quantityScale(item));
}

/** Percentage usage is displayed as physical stock: 56% of a 10 L canister is 5.6 L. */
export function formatQuantity(item: Measured, steps: number, withUnit = true): string {
  const percentage = usesPercentage(item);
  if (percentage && !(item?.unitCapacity && item.unitCapacity > 0)) return '—';
  const format = new Intl.NumberFormat(getAppLanguage() === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: percentage ? 5 : 0 });
  const amount = percentage ? fromSteps(item, steps) * item!.unitCapacity! : steps;
  const unit = withUnit && item?.unit ? ` ${item.unit}` : '';
  return `${format.format(amount)}${unit}`;
}

/** Compact "available/total" (4/10); consumables are used up rather than returned, so only the available count shows. */
export function stockRatio(available: number, total: number, consumable = false, item?: Measured): string {
  return consumable ? formatQuantity(item, available) : `${formatQuantity(item, available, false)}/${formatQuantity(item, total)}`;
}
