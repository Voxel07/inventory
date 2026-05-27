import type { StockTransaction, DamageReport } from '../types';

export interface StockCalculation {
  totalStock: number;
  checkedOut: number;
  damaged: number;
  remaining: number;
}

export function calculateItemStock(
  itemId: string,
  transactions: StockTransaction[] | undefined,
  damageReports: DamageReport[] | undefined
): StockCalculation {
  if (!transactions) {
    return { totalStock: 0, checkedOut: 0, damaged: 0, remaining: 0 };
  }

  let totalAdded = 0;
  let checkedOut = 0;

  for (const tx of transactions) {
    if (tx.itemId !== itemId) continue;
    if (tx.transactionType === 'added') {
      totalAdded += tx.quantityChanged;
    } else if (tx.transactionType === 'checkout') {
      checkedOut += tx.quantityChanged;
    } else if (tx.transactionType === 'checkin') {
      checkedOut -= tx.quantityChanged;
    }
  }
  checkedOut = Math.max(0, checkedOut);

  let damaged = 0;
  let writtenOff = 0;

  if (damageReports) {
    for (const report of damageReports) {
      if (report.itemId !== itemId) continue;
      if (report.status === 'reported' || report.status === 'in_review') {
        damaged += report.amount ?? 0;
      } else if (report.status === 'written_off') {
        writtenOff += report.amount ?? 0;
      }
    }
  }

  const totalStock = Math.max(0, totalAdded - writtenOff);
  const remaining = Math.max(0, totalStock - checkedOut - damaged);

  return {
    totalStock,
    checkedOut,
    damaged,
    remaining,
  };
}
