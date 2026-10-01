import type { StockTransaction } from '../types';

/** Physical on-hand movements, matching the stock ledger rather than availability policy. */
export function stockDelta(transaction: StockTransaction): number {
  switch (transaction.transactionType) {
    case 'added': case 'received': case 'adjusted': case 'checkin': case 'transfer_in':
      return transaction.quantityChanged;
    case 'checkout': case 'written_off': case 'transfer_out':
      return -transaction.quantityChanged;
    default:
      return 0;
  }
}

export function buildStockHistory(transactions: StockTransaction[], currentOnHand: number) {
  const sorted = [...transactions].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  // Anchor the final point to the current snapshot, including stock predating the ledger.
  let stock = currentOnHand - sorted.reduce((sum, transaction) => sum + stockDelta(transaction), 0);
  return sorted.map(transaction => {
    stock += stockDelta(transaction);
    return { date: new Date(transaction.timestamp).toLocaleString(), stock };
  });
}
