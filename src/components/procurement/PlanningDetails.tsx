import { formatDate } from '../../utils/dateFormat';
import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { translate, useT } from '../../utils/naming';
import { OperationForm } from '../operations/OperationForm';
import { overrideForecast, type ProcurementDeficit } from '../../services/procurementService';

export function PlanningDetails({ rows, eventId }: { rows: ProcurementDeficit[]; eventId: string }) {
  const t = useT(); const [override, setOverride] = useState(false);
  return <Stack spacing={2} sx={{ my: 2 }}>
    <Alert severity="info">{t('procurement.planningDetails.forEachEventDemandIsTheGreaterOfItsForecast')}</Alert>
    <Box><Button title={translate('procurement.planningDetails.enterAForecastAdjustmentWithAReason')} disabled={!eventId} onClick={() => setOverride(true)}>{t('procurement.planningDetails.overrideEventForecastWithReason')}</Button></Box>
    {rows.map((row) => <Card key={row.itemId}><CardContent><Typography>{row.name} · {t('procurement.planningDetails.requiredBy')}: {formatDate(row.requiredDate)}</Typography><Typography variant="body2">{t('procurement.planningDetails.demand')}: {row.demand} · {t('procurement.planningDetails.matchingCommitments')}: {row.committedStock ?? 0} · {t('procurement.planningDetails.safetyStock')}: {row.safetyStock ?? 0} · {t('procurement.planningDetails.incomingOnTime')}: {row.orderedStock} · {t('procurement.planningDetails.lateUndated')}: {row.lateOrderedStock ?? 0}</Typography>{row.overrideReason && <Typography variant="body2">{row.overrideActor}: {row.overrideReason}</Typography>}</CardContent></Card>)}
    {override && <OperationForm title={t('procurement.planningDetails.overrideEventForecast')} onClose={() => setOverride(false)} fields={[
      { key: 'itemId', label: t('common.item'), required: true, type: 'item' }, { key: 'quantity', label: t('procurement.planningDetails.totalForecastEventDemand'), type: 'number', min: 0, required: true }, { key: 'reason', label: t('procurement.planningDetails.reason'), required: true, multiline: true },
    ]} onSave={(values) => overrideForecast({ ...values, eventId })}><Alert severity="info">{t('procurement.planningDetails.existingOrderDemandRemainsTheMinimumTheAdjustmentRecordsYour')}</Alert></OperationForm>}
  </Stack>;
}
