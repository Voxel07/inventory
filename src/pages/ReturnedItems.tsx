import { Button } from '../components/shared/ActionButtons';
import { OperationForm } from '../components/operations/OperationForm';
import { useAuth } from '../hooks/useAuth';
import { canOperateWarehouse } from '../utils/access';
import { useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { MediaImage } from '../components/common/MediaImage';
import {
  useAcknowledgeReturnSubmission,
  useRejectReturnSubmission,
  useReturnSubmissions,
} from '../hooks/useReturnSubmissions';
import type { ReturnSubmissionStatus } from '../types';
import { translate, useLocalizedText } from '../utils/naming';

const statusColors: Record<ReturnSubmissionStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'error',
};

export function ReturnedItemsPage() {
  const t = useLocalizedText();
  const { user } = useAuth();
  const [decision, setDecision] = useState<{ id: string; accept: boolean } | null>(null);
  const [status, setStatus] = useState<ReturnSubmissionStatus | ''>('pending');
  const { data = [], isLoading, error } = useReturnSubmissions(status || undefined);
  const acknowledge = useAcknowledgeReturnSubmission();
  const reject = useRejectReturnSubmission();

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { sm: 'center' } }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">{t('Gemeldete Rückgaben', 'Submitted returns')}</Typography>
          <Typography color="text.secondary">
            {t('Prüfen und bestätigen Sie abgelegte Artikel, bevor sie wieder zum Bestand zählen.', 'Inspect and acknowledge placed items before they return to stock.')}
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label={t('Status', 'Status')}
          value={status}
          onChange={(event) => setStatus(event.target.value as ReturnSubmissionStatus | '')}
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="pending">{t('Wartet auf Prüfung', 'Pending acknowledgement')}</MenuItem>
          <MenuItem value="accepted">{t('Bestätigt', 'Accepted')}</MenuItem>
          <MenuItem value="rejected">{t('Abgelehnt', 'Rejected')}</MenuItem>
          <MenuItem value="">{t('Alle', 'All')}</MenuItem>
        </TextField>
      </Stack>

      {error && <Alert severity="error">{t('Rückgaben konnten nicht geladen werden.', 'Could not load returns.')}</Alert>}
      {isLoading ? (
        <Stack spacing={2}>{[1, 2, 3].map((key) => <Skeleton key={key} variant="rounded" height={170} />)}</Stack>
      ) : data.length === 0 ? (
        <Alert severity="info">{t('Keine Rückgaben mit diesem Status.', 'No returns with this status.')}</Alert>
      ) : (
        <Grid container spacing={2}>
          {data.map((entry) => (
            <Grid key={entry.id} size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                {entry.placementImage && (
                  <MediaImage
                    src={entry.placementImage}
                    alt={t('Foto des Rückgabeorts', 'Return placement photo')}
                    sx={{ width: '100%', height: 220, objectFit: 'cover' }}
                  />
                )}
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center' }}>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>{entry.itemName}</Typography>
                    <Chip size="small" color={statusColors[entry.status]} label={entry.status} />
                  </Stack>
                  <Typography variant="body2">
                    {t('Menge', 'Quantity')}: {entry.quantity}{entry.assetCode ? ` · ${entry.assetCode}` : ''}
                  </Typography>
                  <Typography variant="body2">
                    {t('Zurückgegeben für', 'Returned for')}: {entry.returnedForUserName || entry.returnedForUserId}
                  </Typography>
                  <Typography variant="body2">
                    {t('Vorgesehener Rückgabeort', 'Expected return location')}: {entry.expectedReturnLocationName || '—'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {new Date(entry.created).toLocaleString()} · {entry.submittedByName}
                  </Typography>
                  {entry.notes && <Typography sx={{ mt: 1 }}>{entry.notes}</Typography>}
                  {entry.acknowledgementNotes && <Typography sx={{ mt: 1 }}>{t('Prüfnotiz', 'Inspection notes')}: {entry.acknowledgementNotes}</Typography>}
                  {entry.status === 'pending' && canOperateWarehouse(user) && (
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                      <Button title={translate('Die Rückgabe bestätigen und den Bestand einlagern', 'Acknowledge this return and restore it to stock')}
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircleIcon />}
                        disabled={acknowledge.isPending || reject.isPending}
                        onClick={() => setDecision({ id: entry.id, accept: true })}
                      >
                        {t('Bestätigen & einlagern', 'Acknowledge & return to stock')}
                      </Button>
                      <Button title={translate('Diese Rückgabemeldung mit Begründung ablehnen', 'Reject this return submission with a reason')}
                        variant="outlined"
                        color="error"
                        startIcon={<CancelIcon />}
                        disabled={acknowledge.isPending || reject.isPending}
                        onClick={() => setDecision({ id: entry.id, accept: false })}
                      >
                        {t('Ablehnen', 'Reject')}
                      </Button>
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      {decision && <OperationForm title={decision.accept ? t('Rückgabe bestätigen', 'Acknowledge return') : t('Rückgabe ablehnen', 'Reject return')} fields={[{ key: 'notes', label: t('Prüfnotiz / Begründung', 'Inspection notes / reason'), required: !decision.accept, multiline: true }]} onClose={() => setDecision(null)} onSave={(values) => (decision.accept ? acknowledge : reject).mutateAsync({ id: decision.id, notes: String(values.notes || '') })} />}
    </Box>
  );
}
