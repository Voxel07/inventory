import type { CsvItemLot } from '../../types/csvImport';
import { inputChoice, inputRows, inputText } from '../inputValues';

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
    const text = (key: string) => row[key] == null ? undefined : inputText(row[key]).trim();
    const date = (key: string) => {
      const value = text(key);
      if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
        throw new Error(`Charge ${lotNumber}: ${key} muss ein gültiges Datum (YYYY-MM-DD) sein`);
      }
      return value;
    };
    return {
      lotNumber, quantity: row.quantity,
      supplierLot: text('supplierLot'), manufactureDate: date('manufactureDate'),
      expiryDate: date('expiryDate'), bestBeforeDate: date('bestBeforeDate'),
      storageRequirements: text('storageRequirements'), notes: text('notes'),
      status: row.status == null ? undefined : inputChoice(row.status, ['available', 'hold', 'recalled', 'expired', 'depleted']),
    };
  });
}
