import { LOT_STATUSES } from '../../types/operations';
import type { Field } from '../../types/operationForm';
import { formatStatus } from '../../utils/formatters';
import type { Translator } from '../../utils/naming';

/** The only lot attributes: number, expiry and eligibility status. Shared by lot edits and new lots of a goods receipt. */
export function lotFields(t: Translator, prefix = '', required = true): Field[] {
  return [
    { key: `${prefix}lotNumber`, label: t('operations.stockOperations.lotNumber'), required },
    { key: `${prefix}expiryDate`, label: t('operations.stockOperations.expiryDate'), type: 'date' },
    { key: `${prefix}status`, label: t('common.status'), required, options: LOT_STATUSES.map((value) => ({ value, label: formatStatus(value) })) },
  ];
}
