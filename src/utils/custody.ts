import type { CheckedOutRow } from '../types/custody';

/** The faction order a custody row came from; faction custody is one row per item and links to the order page. */
export const factionOrderOf = (row: Pick<CheckedOutRow, 'orderId' | 'orderKind'> | null | undefined) =>
  row?.orderKind === 'faction' ? row.orderId : undefined;

/** The general order a custody row came from; general custody is returned through its order workflow. */
export const generalOrderOf = (row: Pick<CheckedOutRow, 'orderId' | 'orderKind'> | null | undefined) =>
  row?.orderKind === 'general' ? row.orderId : undefined;
