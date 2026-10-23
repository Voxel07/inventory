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
  AlertTitle,
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
import { useAppLanguage, useT } from '../utils/naming';
import { formatDateTime } from '../utils/dateFormat';
import { formatStatus } from '../utils/formatters';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { RuntimeReturnField } from '../components/items/RuntimeReturnField';
import { parseHoursRun } from '../utils/runtimeHours';

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
  const t = useT();
  const language = useAppLanguage();
  const compact = useCompactCatalog();
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<ReturnSubmission | null>(null);
  const [status, setStatus] = useState<ReturnSubmissionStatus | ''>('pending');
  const { data = [], isLoading, isError, refetch } = useReturnSubmissions(status || undefined);

  const labels = { pending: t('pages.returnedItems.awaitingReview'), accepted: t('pages.returnedItems.returnedToStock'), rejected: t('enum.value.rejected') };
  const person = (row: ReturnSubmission) => row.returnedForUserName || row.returnedForUserId;
  const columns: GridColDef<ReturnSubmission>[] = [
    { field: 'itemName', headerName: t('common.item'), minWidth: 200, flex: 1.3,
      renderCell: ({ row }) => <Box sx={{ minWidth: 0, py: 0.5 }}>
        <Link component={RouterLink} to={`/items/${row.itemId}`} underline="hover" color="text.primary" sx={{ fontWeight: 600, display: 'block', whiteSpace: 'normal' }}>{row.itemName}</Link>
        {row.assetCode && <Typography variant="body2" color="text.secondary" className="mono">{row.assetCode}</Typography>}
        {row.reportedDamage?.length > 0 && <DamageChip count={row.reportedDamage.length} />}
      </Box> },
    { field: 'quantity', headerName: t('common.quantity'), type: 'number', width: 90 },
    { field: 'returnedForUserName', headerName: t('pages.returnedItems.for'), minWidth: 140, flex: 0.8, valueGetter: (_, row) => person(row) },
    { field: 'expectedReturnLocationName', headerName: t('common.returnLocation'), minWidth: 160, flex: 1, valueGetter: (_, row) => row.expectedReturnLocationName || '—' },
    { field: 'created', headerName: t('pages.returnedItems.submitted'), width: 170, valueFormatter: (value: number) => formatDateTime(value) },
    { field: 'status', headerName: t('common.status'), width: 160, renderCell: ({ row }) => <Chip size="small" variant="outlined" color={statusColors[row.status]} label={labels[row.status]} /> },
    { field: 'actions', headerName: '', sortable: false, filterable: false, width: 120,
      renderCell: ({ row }) => <Button variant={row.status === 'pending' ? 'contained' : 'outlined'} size="small" aria-haspopup="dialog"
        aria-label={t('pages.returnedItems.reviewReturnOfItemName', { itemName: String(row.itemName) })} onClick={() => setReviewing(row)}>
        {row.status === 'pending' ? t('pages.returnedItems.review') : t('common.details')}
      </Button> },
  ];
  const rows = data.filter(row => [row.itemName, row.assetCode, row.returnedForUserName, row.returnedForUserId, row.expectedReturnLocationName, row.notes].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  const content = (() => {
    if (isError) return <StateMessage kind="error" title={t('pages.returnedItems.couldNotLoadReturns')}
      description={t('common.checkYourConnectionAndTryAgain')}
      action={<Button variant="contained" onClick={() => void refetch()}>{t('common.tryAgain')}</Button>} />;
    if (isLoading) return <StateMessage kind="loading" title={t('pages.returnedItems.loadingReturns')} />;
    if (!data.length) return status === 'pending'
      ? <StateMessage kind="done" title={t('pages.returnedItems.noReturnsAreWaitingForReview')}
        description={t('pages.returnedItems.reportedReturnsAppearHereUntilTheyAreReturnedToStock')} />
      : <StateMessage kind="empty" title={t('pages.returnedItems.noReturns')} />;
    if (!rows.length) return <StateMessage kind="no-matches" title={t('pages.returnedItems.noMatchingReturns')}
      action={<Button variant="outlined" onClick={() => setSearch('')}>{t('pages.returnedItems.clearSearch')}</Button>} />;
    if (compact) return <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }} aria-label={t('pages.returnedItems.returns')}>
      {rows.map((row) => <Box component="li" key={row.id} sx={{ borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
        <ButtonBase onClick={() => setReviewing(row)} aria-haspopup="dialog" sx={{ display: 'block', width: '100%', textAlign: 'left', px: 2, py: 1.5,
          '&:hover': { bgcolor: 'action.hover' }, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 } }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
            <Typography component="span" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{row.quantity}× {row.itemName}</Typography>
            <Chip size="small" variant="outlined" color={statusColors[row.status]} label={labels[row.status]} sx={{ flexShrink: 0 }} />
          </Stack>
          <Typography component="span" variant="body2" sx={{ display: 'block', mt: 0.25 }}>
            {t('pages.returnedItems.for')} {person(row)} · {row.expectedReturnLocationName || t('pages.returnedItems.noReturnLocation')}
          </Typography>
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
            {formatDateTime(row.created)}{row.assetCode ? ' · ' : ''}{row.assetCode && <span className="mono">{row.assetCode}</span>}
          </Typography>
          {row.reportedDamage?.length > 0 && <DamageChip count={row.reportedDamage.length} />}
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
        title={t('pages.returnedItems.reviewReturns')}
        description={t('pages.returnedItems.reportedReturnsOnlyCountAsAvailableStockAgainAfterYou')}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField type="search" size="small" fullWidth label={t('pages.returnedItems.searchItemPersonOrReturnLocation')} value={search} onChange={event => setSearch(event.target.value)} />
        <TextField select size="small" label={t('common.status')} value={status} sx={{ minWidth: 220 }}
          onChange={(event) => setStatus(event.target.value as ReturnSubmissionStatus | '')}>
          <MenuItem value="pending">{labels.pending}</MenuItem>
          <MenuItem value="accepted">{labels.accepted}</MenuItem>
          <MenuItem value="rejected">{labels.rejected}</MenuItem>
          <MenuItem value="">{t('common.all')}</MenuItem>
        </TextField>
      </Stack>
      {content}
      {reviewing && <ReturnReviewDialog key={reviewing.id} submission={reviewing} statusLabel={labels[reviewing.status]} onClose={() => setReviewing(null)} />}
    </Box>
  );
}

function DamageChip({ count }: { count: number }) {
  const t = useT();
  return <Chip component="span" size="small" color="error" icon={<ReportProblemOutlinedIcon />} sx={{ mt: 0.5 }}
    label={count === 1 ? t('pages.returnedItems.damageReported') : t('pages.returnedItems.countDamageReports', { count: count })} />;
}

function ReturnReviewDialog({ submission, statusLabel, onClose }: { submission: ReturnSubmission; statusLabel: string; onClose: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const acknowledge = useAcknowledgeReturnSubmission();
  const reject = useRejectReturnSubmission();
  const [notes, setNotes] = useState('');
  const [hoursRun, setHoursRun] = useState('');
  const [rejectAttempted, setRejectAttempted] = useState(false);
  const runtimeMissing = submission.tracksRuntime && parseHoursRun(hoursRun) == null;
  const pending = acknowledge.isPending || reject.isPending;
  const canDecide = submission.status === 'pending' && canOperateWarehouse(user);
  const error = acknowledge.error || reject.error;
  const close = () => { if (!pending) onClose(); };

  function decide(accept: boolean) {
    if (!accept && !notes.trim()) { setRejectAttempted(true); return; }
    if (accept && runtimeMissing) return;
    if (accept) acknowledge.mutate({ id: submission.id, notes: notes.trim(), hoursRun: submission.tracksRuntime ? parseHoursRun(hoursRun) : undefined }, { onSuccess: onClose });
    else reject.mutate({ id: submission.id, notes: notes.trim() }, { onSuccess: onClose });
  }

  return <FormDialog open onClose={close}>
    <DialogTitle>{t('pages.returnedItems.reviewReturn')}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2.5}>
        <Box>
          <Link component={RouterLink} to={`/items/${submission.itemId}`} sx={{ fontWeight: 600, fontSize: '1.125rem' }}>{submission.quantity}× {submission.itemName}</Link>
          <Box sx={{ mt: 0.5 }}><Chip size="small" variant="outlined" color={statusColors[submission.status]} label={statusLabel} /></Box>
        </Box>
        {submission.reportedDamage?.length > 0 && <Alert severity="error" icon={<ReportProblemOutlinedIcon />}>
          <AlertTitle>{t('pages.returnedItems.damageWasReportedForThisReturn')}</AlertTitle>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {t('pages.returnedItems.inspectBeforeReturningToStockTheDamageStaysOpenUntil')}
          </Typography>
          <Stack component="ul" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
            {submission.reportedDamage.map((damage) => <li key={damage.id}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {[damage.assetCode, `${damage.quantity}×`, damage.severity && formatStatus(damage.severity), formatStatus(damage.status)].filter(Boolean).join(' · ')}
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{damage.description}</Typography>
              <Typography variant="caption" color="text.secondary">{[damage.reportedByName, formatDateTime(damage.reportedAt)].filter(Boolean).join(' · ')}</Typography>
            </li>)}
          </Stack>
          <Link component={RouterLink} to="/damage-reports" sx={{ display: 'inline-block', mt: 1 }}>{t('pages.returnedItems.openDamageReports')}</Link>
        </Alert>}
        <FactList>
          <Fact label={t('pages.returnedItems.returnedFor')}>{submission.returnedForUserName || submission.returnedForUserId}</Fact>
          <Fact label={t('pages.returnedItems.submittedBy')}>{submission.submittedByName || '—'}</Fact>
          <Fact label={t('common.returnLocation')}>{submission.expectedReturnLocationName || '—'}</Fact>
          <Fact label={t('pages.returnedItems.submitted2')}>{formatDateTime(submission.created)}</Fact>
          {submission.assetCode && <Fact label={t('common.asset')}><span className="mono">{submission.assetCode}</span></Fact>}
          {submission.runtimeHours != null && <Fact label={t('items.runtimeReturnField.hoursRun')}>{`${submission.runtimeHours} h${submission.eventName ? ` · ${submission.eventName}` : ''}`}</Fact>}
        </FactList>
        {submission.notes && <Box>
          <Typography variant="body2" color="text.secondary">{t('pages.returnedItems.placementNotes')}</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{submission.notes}</Typography>
        </Box>}
        {submission.placementImage && <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{t('pages.returnedItems.placementPhoto')}</Typography>
          <MediaImage src={submission.placementImage} alt={t('pages.returnedItems.photoOfTheItemPlacedAtTheReturnLocation')}
            sx={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 1, border: 1, borderColor: 'divider' }} />
        </Box>}
        {submission.acknowledgementNotes && <Box>
          <Typography variant="body2" color="text.secondary">{t('pages.returnedItems.inspectionNotes')}</Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap' }}>{submission.acknowledgementNotes}</Typography>
        </Box>}
        {canDecide && <>
          <Alert severity="info">{t('pages.returnedItems.returningToStockMakesTheQuantityAvailableAgainRejectingKeeps')}</Alert>
          {submission.tracksRuntime && <RuntimeReturnField size="medium" value={hoursRun} onChange={setHoursRun}
            current={submission.currentOperatingHours} eventName={submission.eventName} />}
          <TextField label={t('pages.returnedItems.inspectionNotesReason')} value={notes} multiline minRows={2}
            onChange={(event) => setNotes(event.target.value)} error={rejectAttempted && !notes.trim()}
            helperText={rejectAttempted && !notes.trim() ? t('pages.returnedItems.aReasonIsRequiredToReject') : t('pages.returnedItems.optionalWhenReturningToStock')} />
        </>}
        {error && <Alert severity="error">{t('pages.returnedItems.theDecisionCouldNotBeSavedPleaseTryAgain')}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1, flexWrap: 'wrap', pb: { xs: 'calc(12px + env(safe-area-inset-bottom))', sm: 1.5 } }}>
      {canDecide ? <>
        <Button onClick={close} disabled={pending} sx={{ mr: 'auto' }}>{t('common.cancel')}</Button>
        <Button color="error" variant="outlined" disabled={pending} onClick={() => decide(false)}>{t('pages.returnedItems.reject')}</Button>
        <Button variant="contained" disabled={pending || runtimeMissing} onClick={() => decide(true)}>{t('pages.returnedItems.returnToStock')}</Button>
      </> : <Button onClick={close}>{t('common.close')}</Button>}
    </DialogActions>
  </FormDialog>;
}
