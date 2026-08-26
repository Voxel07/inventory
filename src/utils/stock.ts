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
  damageReports: DamageReport[] | undefined,
  initialAmount = 0,
): StockCalculation {
  let totalAdded = 0;
  let checkedOut = 0;
  let hasAddedTransaction = false;

  for (const tx of transactions ?? []) {
    if (tx.itemId !== itemId) continue;
    if (tx.transactionType === 'added') {
      hasAddedTransaction = true;
      totalAdded += tx.quantityChanged;
    } else if (tx.transactionType === 'checkout') {
      checkedOut += tx.quantityChanged;
    } else if (tx.transactionType === 'checkin') {
      checkedOut -= tx.quantityChanged;
    }
  }
  checkedOut = Math.max(0, checkedOut);

  // New items store their opening stock on the item record as well as in an
  // initial transaction. Use the record value until that transaction exists,
  // but never add both values and double-count the opening stock.
  if (!hasAddedTransaction) {
    totalAdded = Math.max(0, initialAmount);
  }

  let damaged = 0;
  let writtenOff = 0;

  if (damageReports) {
    for (const report of damageReports) {
      if (report.itemId !== itemId) continue;
      const storedRepaired = report.repairedAmount ?? 0;
      const storedWrittenOff = report.writtenOffAmount ?? 0;
      const hasStoredResolution = storedRepaired + storedWrittenOff > 0;
      const repairedAmount = !hasStoredResolution && report.status === 'repaired' ? report.amount : storedRepaired;
      const writtenOffAmount = !hasStoredResolution && report.status === 'written_off' ? report.amount : storedWrittenOff;
      damaged += Math.max(0, (report.amount ?? 0) - repairedAmount - writtenOffAmount);
      writtenOff += writtenOffAmount;
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
