import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
import { useLocalizedText } from '../utils/naming';
import { useUIStore } from '../store/uiStore';

const statusColors: Record<ReturnSubmissionStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'error',
};

export function ReturnedItemsPage() {
  const t = useLocalizedText();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [status, setStatus] = useState<ReturnSubmissionStatus | ''>('pending');
  const { data = [], isLoading, error } = useReturnSubmissions(status || undefined);
  const acknowledge = useAcknowledgeReturnSubmission();
  const reject = useRejectReturnSubmission();

  function accept(id: string) {
    acknowledge.mutate({ id }, {
      onSuccess: () => showSnackbar(t('Rückgabe wurde in den Bestand übernommen', 'Return was accepted into stock'), 'success'),
      onError: () => showSnackbar(t('Rückgabe konnte nicht bestätigt werden', 'Could not acknowledge return'), 'error'),
    });
  }

  function decline(id: string) {
    reject.mutate({ id }, {
      onSuccess: () => showSnackbar(t('Rückgabe wurde abgelehnt', 'Return was rejected'), 'success'),
      onError: () => showSnackbar(t('Rückgabe konnte nicht abgelehnt werden', 'Could not reject return'), 'error'),
    });
  }

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
                  {entry.status === 'pending' && (
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircleIcon />}
                        disabled={acknowledge.isPending || reject.isPending}
                        onClick={() => accept(entry.id)}
                      >
                        {t('Bestätigen & einlagern', 'Acknowledge & return to stock')}
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        startIcon={<CancelIcon />}
                        disabled={acknowledge.isPending || reject.isPending}
                        onClick={() => decline(entry.id)}
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
    </Box>
  );
}
