import type { StockHistoryPoint } from '../types/item';

/** Chronological points at which the stock actually changed; observations that repeat the previous level are dropped. */
export function buildStockHistory(points: StockHistoryPoint[]): StockHistoryPoint[] {
  return [...points].sort((a, b) => a.timestamp - b.timestamp)
    .filter((point, index, sorted) => index === 0 || point.total !== sorted[index - 1].total || point.available !== sorted[index - 1].available);
}
