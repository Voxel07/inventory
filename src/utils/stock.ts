import type { Item } from '../types';

export interface StockCalculation {
  totalStock: number;
  checkedOut: number;
  damaged: number;
  remaining: number;
}

export function getItemStock(item: Item | null | undefined): StockCalculation {
  if (item?.stock) {
    return {
      totalStock: item.stock.totalOwned,
      checkedOut: item.stock.checkedOut,
      damaged: item.stock.damaged,
      remaining: item.stock.available,
    };
  }
  const base = item?.amount ?? 0;
  return {
    totalStock: base,
    checkedOut: 0,
    damaged: 0,
    remaining: base,
  };
}
