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
  ]);
  expect(history.map(point => [point.total, point.available])).toEqual([[5, 5], [5, 3]]);
});

test('inspection holds and releases use stored availability without a stock movement', () => {
  const history = buildStockHistory([
    snapshot('initial', 1000, 4, 4),
    snapshot('inspection-due', 2000, 4, 0),
    snapshot('inspection-completed', 3000, 4, 4),
  ]);
  expect(history.map(point => point.total)).toEqual([4, 4, 4]);
  expect(history.map(point => point.available)).toEqual([4, 0, 4]);
});

test('only real stock changes are kept, in time order, without inventing points or mutating the input', () => {
  const points = [
    snapshot('later-change', 3000, 4, 2),
    snapshot('initial', 1000, 4, 4),
    snapshot('unchanged', 2000, 4, 4),
    snapshot('repeat', 4000, 4, 2),
    snapshot('total-change', 5000, 5, 2),
  ];
  expect(buildStockHistory(points).map(point => point.id)).toEqual(['initial', 'later-change', 'total-change']);
  expect(points.map(point => point.id)).toEqual(['later-change', 'initial', 'unchanged', 'repeat', 'total-change']);
  expect(buildStockHistory([snapshot('only', 1000, 4, 0)])).toEqual([snapshot('only', 1000, 4, 0)]);
  expect(buildStockHistory([])).toEqual([]);
});

test('observations with identical timestamps keep their database sequence order', () => {
  const history = buildStockHistory([
    snapshot('received', 1000, 5, 5),
    snapshot('checkout', 1000, 5, 3),
  ]);
  expect(new Set(history.map(point => point.id)).size).toBe(2);
  expect(history.map(point => point.available)).toEqual([5, 3]);
});
