import { Button } from '../shared/ActionButtons';
import { useState } from 'react';

import { OperationForm } from '../operations/OperationForm';
import { PurchaseDraft } from '../operations/PurchasingOperations';
import type { ProcurementDeficit } from '../../services/procurementService';
import { translate, useLocalizedText } from '../../utils/naming';

export function SupplierDraft({ rows, eventId }: { rows: ProcurementDeficit[]; eventId: string }) {
  const t = useLocalizedText();
  const [select, setSelect] = useState(false);
  const [selected, setSelected] = useState<ProcurementDeficit[] | null>(null);
  const eligible = rows.filter((row) => row.recommendedAction !== 'obtain_commitment' && row.netDeficit > row.orderedStock);
  return <>
    <Button title={translate('Fehlmengen für einen gemeinsamen Einkaufsentwurf auswählen', 'Select shortages for a combined purchase draft')} disabled={!eligible.length} onClick={() => setSelect(true)}>{t('Mehrere Artikel bestellen', 'Draft purchase for several items')}</Button>
    {select && <OperationForm title={t('Fehlmengen auswählen', 'Select shortages')} fields={eligible.map((row) => ({ key: row.itemId, label: `${row.name} · ${row.netDeficit - row.orderedStock}`, type: 'checkbox' }))} initial={Object.fromEntries(eligible.map((row) => [row.itemId, true]))} onClose={() => setSelect(false)} onSave={async (values) => {
      const choice = eligible.filter((row) => values[row.itemId]);
      if (!choice.length) throw new Error(t('Mindestens einen Artikel auswählen.', 'Select at least one item.'));
      setSelected(choice);
    }} submitLabel={t('Entwurf prüfen', 'Review draft')} />}
    {selected && <PurchaseDraft selectedRows={selected} eventId={eventId} onClose={() => setSelected(null)} />}
  </>;
}
