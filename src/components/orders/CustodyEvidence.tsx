import { formatDateTime } from '../../utils/dateFormat';
import { AccordionSummary } from '../shared/ActionButtons';
import { Accordion, AccordionDetails, Alert, Card, CardContent, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { apiPage } from '../../services/apiClient';
import { LoadMore } from '../shared/LoadMore';
import { useOperationList } from '../../hooks/useOperations';
import { translate, useT } from '../../utils/naming';
import { formatStatus } from '../../utils/formatters';

type Handover = { id: string; handoverCode: string; type: string; collectorName?: string; occurredAt: string; conditionConfirmed: boolean; notes?: string; lines: { id: string; itemName: string; assetCode?: string; quantity: number; conditionNotes?: string }[] };
type Reconciliation = { id: string; itemName: string; assetCode?: string; outcome: string; quantity: number; notes?: string; createdAt: string };

export function CustodyEvidence({ orderId }: { orderId: string }) {
  const t = useT();
  const handovers = useOperationList(`handovers:${orderId}`, (page, size) => apiPage<Handover>(`/api/orders/${orderId}/handovers`, page, size));
  const returns = useOperationList(`reconciliations:${orderId}`, (page, size) => apiPage<Reconciliation>(`/api/orders/${orderId}/reconciliations`, page, size));
  return <Accordion><AccordionSummary title={translate('orders.custodyEvidence.showOrHideHandoverAndReturnEvidence')} expandIcon={<ExpandMoreIcon />}>{t('orders.custodyEvidence.handoverAndReturnEvidence')}</AccordionSummary><AccordionDetails><Stack spacing={2}>
    {(handovers.error || returns.error) && <Alert severity="error">{(handovers.error || returns.error)?.message}</Alert>}
    {handovers.data?.map((entry) => <Card key={entry.id}><CardContent><Typography variant="subtitle1">{entry.handoverCode} · {formatStatus(entry.type)} · {formatDateTime(entry.occurredAt)}</Typography><Typography>{entry.collectorName} · {entry.notes}</Typography>{entry.lines.map((line) => <Typography key={line.id}>{line.itemName} · {line.assetCode} · {line.quantity} · {line.conditionNotes}</Typography>)}</CardContent></Card>)}
    {returns.data?.map((entry) => <Typography key={entry.id}>{formatDateTime(entry.createdAt)} · {entry.itemName} {entry.assetCode} · {formatStatus(entry.outcome)}: {entry.quantity} · {entry.notes}</Typography>)}
    <LoadMore list={handovers} /><LoadMore list={returns} />
    {!handovers.isLoading && !returns.isLoading && !handovers.data?.length && !returns.data?.length && <Typography>{t('orders.custodyEvidence.noHandoversRecordedYet')}</Typography>}
  </Stack></AccordionDetails></Accordion>;
}
