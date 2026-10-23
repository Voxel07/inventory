import { expect, test } from 'bun:test';
import { buildStockHistory, stockDelta } from '../src/utils/stockHistory';
import type { StockTransaction, TransactionType } from '../src/types';

function transaction(transactionType: TransactionType, quantityChanged: number, timestamp: number): StockTransaction {
  return { id: String(timestamp), itemId: 'item', transactionType, quantityChanged, timestamp, userId: 'actor', reason: '', notes: '', created: timestamp, updated: timestamp };
}

test('receipts appear in history without discarding stock predating the ledger', () => {
  const history = buildStockHistory([
    transaction('received', 5, 1790935200000),
    transaction('checkout', 2, 1790938800000),
  ], 13);
  expect(history.map(point => point.stock)).toEqual([15, 13]);
});

test('an added entry does not force an incorrect zero opening balance', () => {
  const history = buildStockHistory([
    transaction('added', 4, 1790935200000),
    transaction('received', 3, 1790938800000),
  ], 17);
  expect(history.map(point => point.stock)).toEqual([14, 17]);
});

test('signed adjustments, transfers and write-offs reconcile to current on-hand stock', () => {
  const history = buildStockHistory([
    transaction('written_off', 1, 1790949600000),
    transaction('adjusted', -2, 1790935200000),
    transaction('transfer_out', 3, 1790938800000),
    transaction('transfer_in', 3, 1790942400000),
    transaction('damaged', 2, 1790946000000),
  ], 7);
  expect(history.map(point => point.stock)).toEqual([8, 5, 8, 8, 7]);
  expect(stockDelta(transaction('consumed', 2, 1790953200000))).toBe(0);
  expect(stockDelta(transaction('repaired', 2, 1790953200000))).toBe(0);
});

test('transactions within the same minute stay separate chart points', () => {
  const history = buildStockHistory([
    transaction('received', 5, 1790935205000),
    transaction('checkout', 2, 1790935240000),
  ], 3);
  expect(history[0].date).toBe(history[1].date);
  expect(new Set(history.map(point => point.id)).size).toBe(2);
  expect(history.map(point => point.stock)).toEqual([5, 3]);
});
