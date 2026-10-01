import { expect, test } from 'bun:test';
import { buildStockHistory, stockDelta } from '../src/utils/stockHistory';
import type { StockTransaction, TransactionType } from '../src/types';

function transaction(transactionType: TransactionType, quantityChanged: number, timestamp: string): StockTransaction {
  return { id: timestamp, itemId: 'item', transactionType, quantityChanged, timestamp, userId: 'actor', reason: '', notes: '', created: timestamp, updated: timestamp };
}

test('receipts appear in history without discarding stock predating the ledger', () => {
  const history = buildStockHistory([
    transaction('received', 5, '2026-10-02T10:00:00Z'),
    transaction('checkout', 2, '2026-10-02T11:00:00Z'),
  ], 13);
  expect(history.map(point => point.stock)).toEqual([15, 13]);
});

test('an added entry does not force an incorrect zero opening balance', () => {
  const history = buildStockHistory([
    transaction('added', 4, '2026-10-02T10:00:00Z'),
    transaction('received', 3, '2026-10-02T11:00:00Z'),
  ], 17);
  expect(history.map(point => point.stock)).toEqual([14, 17]);
});

test('signed adjustments, transfers and write-offs reconcile to current on-hand stock', () => {
  const history = buildStockHistory([
    transaction('written_off', 1, '2026-10-02T14:00:00Z'),
    transaction('adjusted', -2, '2026-10-02T10:00:00Z'),
    transaction('transfer_out', 3, '2026-10-02T11:00:00Z'),
    transaction('transfer_in', 3, '2026-10-02T12:00:00Z'),
    transaction('damaged', 2, '2026-10-02T13:00:00Z'),
  ], 7);
  expect(history.map(point => point.stock)).toEqual([8, 5, 8, 8, 7]);
  expect(stockDelta(transaction('consumed', 2, '2026-10-02T15:00:00Z'))).toBe(0);
  expect(stockDelta(transaction('repaired', 2, '2026-10-02T15:00:00Z'))).toBe(0);
});
