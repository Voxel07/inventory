import { Button } from '../components/shared/ActionButtons';
import { FormDialog } from '../components/shared/FormDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { StateMessage } from '../components/common/StateMessage';
import { Fact, FactList } from '../components/items/DetailSection';
import { useAuth } from '../hooks/useAuth';
import { canOperateWarehouse } from '../utils/access';
import { useState } from 'react';
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { MediaImage } from '../components/common/MediaImage';
import {
  useAcknowledgeReturnSubmission,
  useRejectReturnSubmission,
  useReturnSubmissions,
} from '../hooks/useReturnSubmissions';
import { useCompactCatalog } from '../hooks/useCompactCatalog';
import type { ReturnSubmission, ReturnSubmissionStatus } from '../types';
import { useAppLanguage, useLocalizedText } from '../utils/naming';
import { formatDateTime } from '../utils/dateFormat';

const statusColors: Record<ReturnSubmissionStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'error',
};

/**
 * Reviewing returned stock. Reporting a return (by the person who had the item)
 * and acknowledging it into stock (by the warehouse) stay separate steps.
 */
export function ReturnedItemsPage() {
  const t = useLocalizedText();
  const language = useAppLanguage();
  const compact = useCompactCatalog();
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<ReturnSubmission | null>(null);
  const [status, setStatus] = useState<ReturnSubmissionStatus | ''>('pending');
  const { data = [], isLoading, isError, refetch } = useReturnSubmissions(status || undefined);

  const labels = { pending: t('Wartet auf Prüfung', 'Awaiting review'), accepted: t('Eingelagert', 'Returned to stock'), rejected: t('Abgelehnt', 'Rejected') };
  const person = (row: ReturnSubmission) => row.returnedForUserName || row.returnedForUserId;
  const columns: GridColDef<ReturnSubmission>[] = [
    { field: 'itemName', headerName: t('Artikel', 'Item'), minWidth: 200, flex: 1.3,
      renderCell: ({ row }) => <Box sx={{ minWidth: 0, py: 0.5 }}>
        <Link component={RouterLink} to={`/items/${row.itemId}`} underline="hover" color="text.primary" sx={{ fontWeight: 600, display: 'block', whiteSpace: 'normal' }}>{row.itemName}</Link>
        {row.assetCode && <Typography variant="body2" color="text.secondary" className="mono">{row.assetCode}</Typography>}
      </Box> },
    { field: 'quantity', headerName: t('Menge', 'Quantity'), type: 'number', width: 90 },
    { field: 'returnedForUserName', headerName: t('Für', 'For'), minWidth: 140, flex: 0.8, valueGetter: (_, row) => person(row) },
    { field: 'expectedReturnLocationName', headerName: t('Rückgabeort', 'Return location'), minWidth: 160, flex: 1, valueGetter: (_, row) => row.expectedReturnLocationName || '—' },
    { field: 'created', headerName: t('Gemeldet', 'Submitted'), width: 170, valueFormatter: (value: string) => formatDateTime(value) },
    { field: 'status', headerName: t('Status', 'Status'), width: 160, renderCell: ({ row }) => <Chip size="small" variant="outlined" color={statusColors[row.status]} label={labels[row.status]} /> },
    { field: 'actions', headerName: '', sortable: false, filterable: false, width: 120,
      renderCell: ({ row }) => <Button variant={row.status === 'pending' ? 'contained' : 'outlined'} size="small" aria-haspopup="dialog"
        aria-label={t(`Rückgabe von ${row.itemName} prüfen`, `Review return of ${row.itemName}`)} onClick={() => setReviewing(row)}>
        {row.status === 'pending' ? t('Prüfen', 'Review') : t('Details', 'Details')}
      </Button> },
  ];
  const rows = data.filter(row => [row.itemName, row.assetCode, row.returnedForUserName, row.returnedForUserId, row.expectedReturnLocationName, row.notes].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  const content = (() => {
    if (isError) return <StateMessage kind="error" title={t('Rückgaben konnten nicht geladen werden', 'Could not load returns')}
      description={t('Prüfe die Verbindung und versuche es erneut.', 'Check your connection and try again.')}
      action={<Button variant="contained" onClick={() => void refetch()}>{t('Erneut versuchen', 'Try again')}</Button>} />;
    if (isLoading) return <StateMessage kind="loading" title={t('Rückgaben werden geladen…', 'Loading returns…')} />;
    if (!data.length) return status === 'pending'
      ? <StateMessage kind="done" title={t('Keine Rückgaben warten auf Prüfung', 'No returns are waiting for review')}
        description={t('Gemeldete Rückgaben erscheinen hier, bis sie eingelagert oder abgelehnt werden.', 'Reported returns appear here until they are returned to stock or rejected.')} />
      : <StateMessage kind="empty" title={t('Keine Rückgaben', 'No returns')} />;
    if (!rows.length) return <StateMessage kind="no-matches" title={t('Keine passenden Rückgaben', 'No matching returns')}
      action={<Button variant="outlined" onClick={() => setSearch('')}>{t('Suche zurücksetzen', 'Clear search')}</Button>} />;
    if (compact) return <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }} aria-label={t('Rückgaben', 'Returns')}>
      {rows.map((row) => <Box component="li" key={row.id} sx={{ borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
        <ButtonBase onClick={() => setReviewing(row)} aria-haspopup="dialog" sx={{ display: 'block', width: '100%', textAlign: 'left', px: 2, py: 1.5,
          '&:hover': { bgcolor: 'action.hover' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
            <Typography component="span" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{row.quantity}× {row.itemName}</Typography>
            <Chip size="small" variant="outlined" color={statusColors[row.status]} label={labels[row.status]} sx={{ flexShrink: 0 }} />
          </Stack>
          <Typography component="span" variant="body2" sx={{ display: 'block', mt: 0.25 }}>
            {t('Für', 'For')} {person(row)} · {row.expectedReturnLocationName || t('kein Rückgabeort', 'no return location')}
          </Typography>
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
            {formatDateTime(row.created)}{row.assetCode ? ' · ' : ''}{row.assetCode && <span className="mono">{row.assetCode}</span>}
          </Typography>
        </ButtonBase>
      </Box>)}
    </Paper>;
    return <DataGrid rows={rows} columns={columns} getRowHeight={() => 'auto'} autoHeight disableRowSelectionOnClick
      initialState={{ pagination: { paginationModel: { page: 0, pageSize: 25 } } }} pageSizeOptions={[25, 50, 100]}
      localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
      sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', py: 1 } }} />;
  })();

  return (
    <Box>
      <PageHeader
        title={t('Rückgaben prüfen', 'Review returns')}
        description={t('Gemeldete Rückgaben zählen erst nach deiner Prüfung wieder zum verfügbaren Bestand.', 'Reported returns only count as available stock again after you review them.')}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField type="search" size="small" fullWidth label={t('Artikel, Person oder Rückgabeort suchen', 'Search item, person or return location')} value={search} onChange={event => setSearch(event.target.value)} />
        <TextField select size="small" label={t('Status', 'Status')} value={status} sx={{ minWidth: 220 }}
          onChange={(event) => setStatus(event.target.value as ReturnSubmissionStatus | '')}>
          <MenuItem value="pending">{labels.pending}</MenuItem>
          <MenuItem value="accepted">{labels.accepted}</MenuItem>
          <MenuItem value="rejected">{labels.rejected}</MenuItem>
          <MenuItem value="">{t('Alle', 'All')}</MenuItem>
        </TextField>
      </Stack>
      {content}
      {reviewing && <ReturnReviewDialog key={reviewing.id} submission={reviewing} statusLabel={labels[reviewing.status]} onClose={() => setReviewing(null)} />}
    </Box>
  );
}

function ReturnReviewDialog({ submission, statusLabel, onClose }: { submission: ReturnSubmission; statusLabel: string; onClose: () => void }) {
  const t = useLocalizedText();
  const { user } = useAuth();
  const acknowledge = useAcknowledgeReturnSubmission();
  const reject = useRejectReturnSubmission();
  const [notes, setNotes] = useState('');
  const [rejectAttempted, setRejectAttempted] = useState(false);
  const pending = acknowledge.isPending || reject.isPending;
  const canDecide = submission.status === 'pending' && canOperateWarehouse(user);
  const error = acknowledge.error || reject.error;
  const close = () => { if (!pending) onClose(); };

  function decide(accept: boolean) {
    if (!accept && !notes.trim()) { setRejectAttempted(true); return; }
    (accept ? acknowledge : reject).mutate({ id: submission.id, notes: notes.trim() }, { onSuccess: onClose });
  }

  return <FormDialog open onClose={close}>
    <DialogTitle>{t('Rückgabe prüfen', 'Review return')}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2.5}>
        <Box>
          <Link component={RouterLink} to={`/items/${submission.itemId}`} sx={{ fontWeight: 600, fontSize: '1.125rem' }}>{submission.quantity}× {submission.itemName}</Link>
          <Box sx={{ mt: 0.5 }}><Chip size="small" variant="outlined" color={statusColors[submission.status]} label={statusLabel} /></Box>
        </Box>
        <FactList>
          <Fact label={t('Zurückgegeben für', 'Returned for')}>{submission.returnedForUserName || submission.returnedForUserId}</Fact>
          <Fact label={t('Gemeldet von', 'Submitted by')}>{submission.submittedByName || '—'}</Fact>
          <Fact label={t('Rückgabeort', 'Return location')}>{submission.expectedReturnLocationName || '—'}</Fact>
          <Fact label={t('Gemeldet am', 'Submitted')}>{formatDateTime(submission.created)}</Fact>
          {submission.assetCode && <Fact label={t('Gerät', 'Asset')}><span className="mono">{submission.assetCode}</span></Fact>}
        </FactList>
        {submission.notes && <Box>
          <Typography variant="body2" color="text.secondary">{t('Notiz zur Ablage', 'Placement notes')}</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{submission.notes}</Typography>
        </Box>}
        {submission.placementImage && <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{t('Foto der Ablage', 'Placement photo')}</Typography>
          <MediaImage src={submission.placementImage} alt={t('Foto des abgelegten Artikels am Rückgabeort', 'Photo of the item placed at the return location')}
            sx={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider' }} />
        </Box>}
        {submission.acknowledgementNotes && <Box>
          <Typography variant="body2" color="text.secondary">{t('Prüfnotiz', 'Inspection notes')}</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{submission.acknowledgementNotes}</Typography>
        </Box>}
        {canDecide && <>
          <Alert severity="info">{t('Einlagern macht die Menge wieder verfügbar. Ablehnen hält sie aus dem Bestand heraus und erfordert eine Begründung.', 'Returning to stock makes the quantity available again. Rejecting keeps it out of stock and needs a reason.')}</Alert>
          <TextField label={t('Prüfnotiz / Begründung', 'Inspection notes / reason')} value={notes} multiline minRows={2}
            onChange={(event) => setNotes(event.target.value)} error={rejectAttempted && !notes.trim()}
            helperText={rejectAttempted && !notes.trim() ? t('Zum Ablehnen ist eine Begründung erforderlich.', 'A reason is required to reject.') : t('Optional beim Einlagern', 'Optional when returning to stock')} />
        </>}
        {error && <Alert severity="error">{t('Die Entscheidung konnte nicht gespeichert werden. Bitte erneut versuchen.', 'The decision could not be saved. Please try again.')}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1, flexWrap: 'wrap', pb: { xs: 'calc(12px + env(safe-area-inset-bottom))', sm: 1.5 } }}>
      {canDecide ? <>
        <Button onClick={close} disabled={pending} sx={{ mr: 'auto' }}>{t('Abbrechen', 'Cancel')}</Button>
        <Button color="error" variant="outlined" disabled={pending} onClick={() => decide(false)}>{t('Ablehnen', 'Reject')}</Button>
        <Button variant="contained" disabled={pending} onClick={() => decide(true)}>{t('Einlagern', 'Return to stock')}</Button>
      </> : <Button onClick={close}>{t('Schließen', 'Close')}</Button>}
    </DialogActions>
  </FormDialog>;
}
