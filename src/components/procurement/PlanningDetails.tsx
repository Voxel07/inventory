import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Card, CardContent, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { translate, useLocalizedText } from '../../utils/naming';
import { OperationForm } from '../operations/OperationForm';
import { useItems } from '../../hooks/useItems';
import { overrideForecast, type ProcurementDeficit } from '../../services/procurementService';

export function PlanningDetails({ rows, eventId }: { rows: ProcurementDeficit[]; eventId: string }) {
  const t = useLocalizedText(); const [override, setOverride] = useState(false); const { data: items = [] } = useItems();
  return <Stack spacing={2} sx={{ my: 2 }}>
    <Alert severity="info">{t('Je Event gilt der größere Wert aus Prognose und Bestellbedarf. Verbrauch wird summiert; Mehrwegmaterial wird für überlappende Events benötigt und bis einen Tag nach Eventende eingeplant. Nur terminierte Lieferungen vor Bedarf decken Fehlmengen. Organisationsbestand aller Lagerorte ist enthalten. Eingeschränkter oder privater Bestand zählt nur mit passender Zusage; ein Einkauf ersetzt keine Zusage.', 'For each event, demand is the greater of its forecast and orders. Consumables accumulate; reusable equipment is needed across overlapping events through the day after the event ends. Only deliveries due by the required date cover shortages. Organization stock across all locations is included. Restricted or private stock counts only with a matching commitment; purchases do not replace consent.')}</Alert>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button title={translate('Bestände und mögliche Umlagerungen prüfen', 'Review stock and possible transfers')} component={Link} to="/operations?tab=stock">{t('Bestände / Umlagerung prüfen', 'Check locations / arrange transfer')}</Button><Button title={translate('Eine begründete Änderung der Eventprognose erfassen', 'Enter a forecast adjustment with a reason')} disabled={!eventId} onClick={() => setOverride(true)}>{t('Eventprognose begründet anpassen', 'Override event forecast with reason')}</Button></Stack>
    {rows.map((row) => <Card key={row.itemId}><CardContent><Typography>{row.name} · {t('Benötigt bis', 'Required by')}: {row.requiredDate}</Typography><Typography variant="body2">{t('Bedarf', 'Demand')}: {row.demand} · {t('Passend zugesagt', 'Matching commitments')}: {row.committedStock ?? 0} · {t('Sicherheitsbestand', 'Safety stock')}: {row.safetyStock ?? 0} · {t('Rechtzeitig unterwegs', 'Incoming on time')}: {row.orderedStock} · {t('Später / ohne Datum', 'Late / undated')}: {row.lateOrderedStock ?? 0}</Typography>{row.overrideReason && <Typography variant="body2">{row.overrideActor}: {row.overrideReason}</Typography>}</CardContent></Card>)}
    {override && <OperationForm title={t('Eventprognose anpassen', 'Override event forecast')} onClose={() => setOverride(false)} fields={[
      { key: 'itemId', label: t('Artikel', 'Item'), required: true, options: items.map((item) => ({ value: item.id, label: item.name })) }, { key: 'quantity', label: t('Gesamter prognostizierter Eventbedarf', 'Total forecast event demand'), type: 'number', min: 0, required: true }, { key: 'reason', label: t('Begründung', 'Reason'), required: true, multiline: true },
    ]} onSave={(values) => overrideForecast({ ...values, eventId })}><Alert severity="info">{t('Bereits angefragte Bestellmengen bleiben die Untergrenze. Die Änderung wird mit Benutzer und Zeit gespeichert.', 'Existing order demand remains the minimum. The adjustment records your identity and time.')}</Alert></OperationForm>}
  </Stack>;
}
