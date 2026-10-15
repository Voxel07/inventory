import { Button } from '../shared/ActionButtons';
import { useState } from 'react';

import { OperationForm } from '../operations/OperationForm';
import { PurchaseDraft } from '../operations/PurchasingOperations';
import type { ProcurementDeficit } from '../../services/procurementService';
import { translate, useT } from '../../utils/naming';

export function SupplierDraft({ rows, eventId }: { rows: ProcurementDeficit[]; eventId: string }) {
  const t = useT();
  const [select, setSelect] = useState(false);
  const [selected, setSelected] = useState<ProcurementDeficit[] | null>(null);
  const eligible = rows.filter((row) => row.recommendedAction !== 'obtain_commitment' && row.netDeficit > row.orderedStock);
  return <>
    <Button title={translate('procurement.supplierDraft.selectShortagesForACombinedPurchaseDraft')} disabled={!eligible.length} onClick={() => setSelect(true)}>{t('procurement.supplierDraft.draftPurchaseForSeveralItems')}</Button>
    {select && <OperationForm title={t('procurement.supplierDraft.selectShortages')} fields={eligible.map((row) => ({ key: row.itemId, label: `${row.name} · ${row.netDeficit - row.orderedStock}`, type: 'checkbox' }))} initial={Object.fromEntries(eligible.map((row) => [row.itemId, true]))} onClose={() => setSelect(false)} onSave={async (values) => {
      const choice = eligible.filter((row) => values[row.itemId]);
      if (!choice.length) throw new Error(t('procurement.supplierDraft.selectAtLeastOneItem'));
      setSelected(choice);
    }} submitLabel={t('procurement.supplierDraft.reviewDraft')} />}
    {selected && <PurchaseDraft selectedRows={selected} eventId={eventId} onClose={() => setSelected(null)} />}
  </>;
}
