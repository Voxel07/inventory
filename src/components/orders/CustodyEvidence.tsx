import { Accordion, AccordionDetails, AccordionSummary, Alert, Card, CardContent, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { apiRequest } from '../../services/apiClient';
import { useOperationList } from '../../hooks/useOperations';
import { useLocalizedText } from '../../utils/naming';

type Handover = { id: string; handoverCode: string; type: string; collectorName?: string; occurredAt: string; conditionConfirmed: boolean; notes?: string; lines: { id: string; itemName: string; assetCode?: string; quantity: number; conditionNotes?: string }[] };
type Reconciliation = { id: string; itemName: string; assetCode?: string; outcome: string; quantity: number; notes?: string; createdAt: string };

export function CustodyEvidence({ orderId }: { orderId: string }) {
  const t = useLocalizedText();
  const handovers = useOperationList(`handovers:${orderId}`, (page, size) => apiRequest<Handover[]>(`/api/orders/${orderId}/handovers`, { query: { page, size } }));
  const returns = useOperationList(`reconciliations:${orderId}`, (page, size) => apiRequest<Reconciliation[]>(`/api/orders/${orderId}/reconciliations`, { query: { page, size } }));
  return <Accordion><AccordionSummary expandIcon={<ExpandMoreIcon />}>{t('Übergabe- und Rückgabenachweise', 'Handover and return evidence')}</AccordionSummary><AccordionDetails><Stack spacing={2}>
    {(handovers.error || returns.error) && <Alert severity="error">{(handovers.error || returns.error)?.message}</Alert>}
    {handovers.data?.map((entry) => <Card key={entry.id}><CardContent><Typography variant="subtitle1">{entry.handoverCode} · {entry.type} · {new Date(entry.occurredAt).toLocaleString()}</Typography><Typography>{entry.collectorName} · {entry.notes}</Typography>{entry.lines.map((line) => <Typography key={line.id}>{line.itemName} · {line.assetCode} · {line.quantity} · {line.conditionNotes}</Typography>)}</CardContent></Card>)}
    {returns.data?.map((entry) => <Typography key={entry.id}>{new Date(entry.createdAt).toLocaleString()} · {entry.itemName} {entry.assetCode} · {entry.outcome}: {entry.quantity} · {entry.notes}</Typography>)}
    {!handovers.isLoading && !returns.isLoading && !handovers.data?.length && !returns.data?.length && <Typography>{t('Noch keine Übergaben.', 'No handovers recorded yet.')}</Typography>}
  </Stack></AccordionDetails></Accordion>;
}
