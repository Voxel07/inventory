import type { StockHistoryPoint } from '../types/item';

/** Extend the last observation to now without inventing availability before recording began. */
export function buildStockHistory(points: StockHistoryPoint[], now = Date.now()): StockHistoryPoint[] {
  const history = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const last = history.at(-1);
  if (last && now > last.timestamp) history.push({ ...last, id: 'current', timestamp: now });
  return history;
}
