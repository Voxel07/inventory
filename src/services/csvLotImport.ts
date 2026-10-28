import type { CsvItemLot } from '../types/csvImport';
import type { Lot } from '../types/operations';
import { apiRequest } from './apiClient';
import { loadAllPages } from './apiPagination';
import { assertAuthSession, captureAuthSession } from './authManager';
import { csvCommandId } from './csvImportIdentity';
import { operationsApi } from './operationsService';

/** Each lot is created by the stock booking that brings its quantity in; stable commands let an interrupted import resume. */
export function createCsvLotImporter() {
  const context = captureAuthSession();
  const byItem = new Map<string, Lot[]>();
  return async (itemId: string, lots: CsvItemLot[], locationId: string | null) => {
    assertAuthSession(context);
    let existing = byItem.get(itemId);
    if (!existing) {
      existing = await loadAllPages(operationsApi.lots({ itemId }));
      assertAuthSession(context);
      byItem.set(itemId, existing);
    }
    for (const { quantity, ...newLot } of lots) {
      assertAuthSession(context);
      const lot = existing.find((entry) => entry.lotNumber.toLowerCase() === newLot.lotNumber.toLowerCase());
      const idempotencyKey = await csvCommandId(JSON.stringify(['lot-opening-stock', itemId, newLot.lotNumber, locationId]));
      assertAuthSession(context);
      await apiRequest('/api/transactions', { method: 'POST', session: context, body: {
        itemId, ...(lot ? { lotId: lot.id } : { newLot }), locationId, transactionType: 'adjusted', quantityChanged: quantity,
        reason: 'CSV-Import Chargen-Anfangsbestand', idempotencyKey,
      } });
    }
  };
}
