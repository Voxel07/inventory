import { expect, test } from 'bun:test';
import { buildStockHistory } from '../src/utils/stockHistory';
import type { StockHistoryPoint } from '../src/types/item';

function snapshot(id: string, timestamp: number, total: number, available: number): StockHistoryPoint {
  return { id, timestamp, total, available };
}

test('checkout changes availability while preserving total owned stock', () => {
  const history = buildStockHistory([
    snapshot('received', 1000, 5, 5),
    snapshot('checkout', 2000, 5, 3),
  ], 2000);
  expect(history.map(point => [point.total, point.available])).toEqual([[5, 5], [5, 3]]);
});

test('inspection holds and releases use stored availability without a stock movement', () => {
  const history = buildStockHistory([
    snapshot('initial', 1000, 4, 4),
    snapshot('inspection-due', 2000, 4, 0),
    snapshot('inspection-completed', 3000, 4, 4),
  ], 3000);
  expect(history.map(point => point.total)).toEqual([4, 4, 4]);
  expect(history.map(point => point.available)).toEqual([4, 0, 4]);
});

test('the last observation extends to now without changing the input or inventing earlier stock', () => {
  const points = [snapshot('initial', 1000, 4, 0)];
  expect(buildStockHistory(points, 2000)).toEqual([
    points[0], snapshot('current', 2000, 4, 0),
  ]);
  expect(points).toHaveLength(1);
  expect(buildStockHistory([], 2000)).toEqual([]);
});

test('observations with identical timestamps keep their database sequence order', () => {
  const history = buildStockHistory([
    snapshot('received', 1000, 5, 5),
    snapshot('checkout', 1000, 5, 3),
  ], 1000);
  expect(new Set(history.map(point => point.id)).size).toBe(2);
  expect(history.map(point => point.available)).toEqual([5, 3]);
});
