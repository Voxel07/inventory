import type { CsvItemLot } from '../types/csvImport';
import type { Lot } from '../types/operations';
import { apiRequest } from './apiClient';
import { loadAllPages } from './apiPagination';
import { assertAuthSession, captureAuthSession } from './authManager';
import { csvCommandId } from './csvImportIdentity';
import { operationsApi } from './operationsService';

/** Reuse lot numbers and stable stock commands so an interrupted import can resume. */
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
    for (const { quantity, ...metadata } of lots) {
      assertAuthSession(context);
      let lot = existing.find((entry) => entry.lotNumber === metadata.lotNumber);
      if (!lot) {
        lot = await operationsApi.createLot({ itemId, ...metadata });
        assertAuthSession(context);
        existing.push(lot);
      }
      if (quantity > 0) {
        const idempotencyKey = await csvCommandId(JSON.stringify(['lot-opening-stock', itemId, lot.id, locationId]));
        assertAuthSession(context);
        await apiRequest('/api/transactions', { method: 'POST', session: context, body: {
          itemId, lotId: lot.id, locationId, transactionType: 'adjusted', quantityChanged: quantity,
          reason: 'CSV-Import Chargen-Anfangsbestand', idempotencyKey,
        } });
      }
    }
  };
}
