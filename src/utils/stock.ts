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

type Measured = Pick<Item, 'unit' | 'quantityDecimals'> | null | undefined;

/**
 * Quantities travel as whole steps of 10^-quantityDecimals of the item's unit (7.5 L with one decimal is 75), so stock
 * arithmetic stays exact; these convert at the edge, where people read and type them.
 */
export function quantityScale(item: Measured): number {
  return 10 ** (item?.quantityDecimals ?? 0);
}

/** Steps → the number people read (75 → 7.5). */
export function fromSteps(item: Measured, steps: number): number {
  return steps / quantityScale(item);
}

/** A typed amount → steps, or NaN when it has more decimals than the item allows. */
export function toSteps(item: Measured, value: number | string): number {
  const amount = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  const steps = amount * quantityScale(item);
  const rounded = Math.round(steps);
  return Math.abs(steps - rounded) < 1e-6 ? rounded : Number.NaN;
}

/** "7,5 L" / "7.5 L"; pieces show the bare number. */
export function formatQuantity(item: Measured, steps: number, withUnit = true): string {
  const decimals = item?.quantityDecimals ?? 0;
  const text = new Intl.NumberFormat(getAppLanguage() === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: decimals })
    .format(fromSteps(item, steps));
  return withUnit && item?.unit ? `${text} ${item.unit}` : text;
}

/** Step attribute of a number input for this item (0.1 for one decimal). */
export function inputStep(item: Measured): number {
  return 1 / quantityScale(item);
}

/** Compact "available/total" (4/10); consumables are used up rather than returned, so only the available count shows. */
export function stockRatio(available: number, total: number, consumable = false, item?: Measured): string {
  return consumable ? formatQuantity(item, available) : `${formatQuantity(item, available, false)}/${formatQuantity(item, total)}`;
}
