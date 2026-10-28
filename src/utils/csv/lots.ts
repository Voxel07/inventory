import { csvDate, isCsvDate } from './eventLogistics';
import type { CsvItemLot } from '../../types/csvImport';
import { inputChoice, inputRows, inputText } from '../inputValues';
import { LOT_STATUSES } from '../../types/operations';

/** Lots is a JSON array; quantities belong to individual batches, not an automatic opening lot. */
export function parseItemLots(value: string | undefined): CsvItemLot[] | undefined {
  if (!value) return undefined;
  const rows = inputRows(JSON.parse(value));
  if (!rows.length) throw new Error('Lots muss mindestens eine Charge enthalten');
  const numbers = new Set<string>();
  return rows.map((row) => {
    const lotNumber = inputText(row.lotNumber).trim();
    if (numbers.has(lotNumber)) throw new Error(`Doppelte Chargennummer: ${lotNumber}`);
    numbers.add(lotNumber);
    if (typeof row.quantity !== 'number' || !Number.isSafeInteger(row.quantity) || row.quantity < 0) {
      throw new Error(`Charge ${lotNumber}: quantity muss eine nichtnegative ganze Zahl sein`);
    }
    // A lot is a number, an expiry date and a status; its stock is the quantity booked with it.
    const expiry = row.expiryDate == null ? '' : inputText(row.expiryDate).trim();
    if (expiry && !isCsvDate(expiry)) throw new Error(`Charge ${lotNumber}: expiryDate muss ein gültiges Datum (DD-MM-YYYY) sein`);
    if (row.quantity === 0) throw new Error(`Charge ${lotNumber}: Eine Charge entsteht nur mit Bestand (quantity > 0)`);
    return {
      lotNumber, quantity: row.quantity,
      expiryDate: expiry ? csvDate(expiry) : undefined,
      status: row.status == null ? undefined : inputChoice(row.status, LOT_STATUSES),
    };
  });
}
