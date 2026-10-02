import { Button, IconButton } from '../components/shared/ActionButtons';
import { OperationForm } from '../components/operations/OperationForm';
import { useAuth } from '../hooks/useAuth';
import { canOperateWarehouse } from '../utils/access';
import { useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Tooltip,
  Link,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PhotoOutlinedIcon from '@mui/icons-material/PhotoOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { MediaImage } from '../components/common/MediaImage';
import {
  useAcknowledgeReturnSubmission,
  useRejectReturnSubmission,
  useReturnSubmissions,
} from '../hooks/useReturnSubmissions';
import type { ReturnSubmission, ReturnSubmissionStatus } from '../types';
import { useAppLanguage, useLocalizedText } from '../utils/naming';

const statusColors: Record<ReturnSubmissionStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'error',
};

export function ReturnedItemsPage() {
  const t = useLocalizedText();
  const { user } = useAuth();
  const language = useAppLanguage();
  const isMobile = useMediaQuery('(max-width:599.95px)');
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<{ id: string; accept: boolean } | null>(null);
  const [status, setStatus] = useState<ReturnSubmissionStatus | ''>('pending');
  const { data = [], isLoading, error, refetch } = useReturnSubmissions(status || undefined);
  const acknowledge = useAcknowledgeReturnSubmission();
  const reject = useRejectReturnSubmission();

  const labels = { pending: t('Prüfung ausstehend', 'Pending'), accepted: t('Bestätigt', 'Accepted'), rejected: t('Abgelehnt', 'Rejected') };
  const columns: GridColDef<ReturnSubmission>[] = [
    { field: 'itemName', headerName: t('Artikel', 'Item'), minWidth: isMobile ? 140 : 180, flex: 1.3,
      renderCell: ({ row }) => <Stack sx={{ minWidth: 0 }}><Link component={RouterLink} to={`/items/${row.itemId}`} underline="hover" color="text.primary" sx={{ fontWeight: 600, lineHeight: 1.4 }}>{row.itemName}</Link>{isMobile && <Chip size="small" variant="outlined" color={statusColors[row.status]} label={labels[row.status]} sx={{ alignSelf: 'flex-start' }} />}{!isMobile && row.assetCode && <Typography variant="caption" color="text.secondary">{row.assetCode}</Typography>}</Stack> },
    { field: 'quantity', headerName: isMobile ? t('Anz.', 'Qty') : t('Menge', 'Quantity'), type: 'number', width: 60 },
    { field: 'returnedForUserName', headerName: t('Für', 'For'), minWidth: 120, flex: 0.8, valueGetter: (_, row) => row.returnedForUserName || row.returnedForUserId },
    { field: 'expectedReturnLocationName', headerName: t('Rückgabeort', 'Return location'), minWidth: 160, flex: 1, valueGetter: (_, row) => row.expectedReturnLocationName || '—' },
    { field: 'status', headerName: t('Status', 'Status'), width: 130, renderCell: ({ row }) => <Chip size="small" variant="outlined" color={statusColors[row.status]} label={labels[row.status]} /> },
    { field: 'created', headerName: t('Gemeldet', 'Submitted'), width: 140, valueFormatter: (value: string) => new Date(value).toLocaleString() },
    { field: 'actions', headerName: t('Prüfung', 'Review'), sortable: false, filterable: false, width: isMobile ? 132 : 145,
      renderCell: ({ row }) => <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
        <Tooltip arrow enterTouchDelay={0} title={<Stack spacing={0.5} sx={{ maxWidth: 360 }}><Typography variant="body2">{t('Gemeldet von', 'Submitted by')}: {row.submittedByName}</Typography><Typography variant="body2">{t('Für', 'For')}: {row.returnedForUserName || row.returnedForUserId} · {row.expectedReturnLocationName || '—'}</Typography><Typography variant="body2">{new Date(row.created).toLocaleString()}{row.assetCode ? ` · ${row.assetCode}` : ''}</Typography>{row.notes && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{row.notes}</Typography>}{row.acknowledgementNotes && <Typography variant="body2">{t('Prüfnotiz', 'Inspection notes')}: {row.acknowledgementNotes}</Typography>}</Stack>}>
          <IconButton size="small" aria-label={t('Rückgabedetails', 'Return details')}><InfoOutlinedIcon fontSize="small" /></IconButton>
        </Tooltip>
        {row.placementImage && <Tooltip arrow enterTouchDelay={0} title={<MediaImage src={row.placementImage} alt={t('Foto des Rückgabeorts', 'Return placement photo')} sx={{ width: 280, height: 180, objectFit: 'contain' }} />} ><IconButton size="small" aria-label={t('Rückgabefoto', 'Return photo')}><PhotoOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
        {row.status === 'pending' && canOperateWarehouse(user) && <>
          <IconButton size="small" color="success" title={t('Bestätigen & einlagern', 'Acknowledge & return to stock')} disabled={acknowledge.isPending || reject.isPending} onClick={() => setDecision({ id: row.id, accept: true })}><CheckCircleIcon fontSize="small" /></IconButton>
          <IconButton size="small" color="error" title={t('Ablehnen', 'Reject')} disabled={acknowledge.isPending || reject.isPending} onClick={() => setDecision({ id: row.id, accept: false })}><CancelIcon fontSize="small" /></IconButton>
        </>}
      </Stack> },
  ];
  const rows = data.filter(row => [row.itemName, row.assetCode, row.returnedForUserName, row.returnedForUserId, row.expectedReturnLocationName, row.notes].filter(Boolean).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

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

      <TextField size="small" fullWidth label={t('Artikel, Person oder Rückgabeort suchen', 'Search item, person or return location')} value={search} onChange={event => setSearch(event.target.value)} sx={{ mb: 1.5 }} />
      {error && <Alert severity="error" sx={{ mb: 1 }} action={<Button onClick={() => void refetch()}>{t('Erneut laden', 'Retry')}</Button>}>{t('Rückgaben konnten nicht geladen werden.', 'Could not load returns.')}</Alert>}
      <DataGrid columnVisibilityModel={{ returnedForUserName: !isMobile, expectedReturnLocationName: !isMobile, created: !isMobile, status: !isMobile }} rows={rows} columns={columns} loading={isLoading} density="compact" rowHeight={isMobile ? 64 : 54} autoHeight disableRowSelectionOnClick
        initialState={{ pagination: { paginationModel: { page: 0, pageSize: 20 } } }} pageSizeOptions={[20, 50, 100]}
        localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
        sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center' } }} />
      {decision && <OperationForm title={decision.accept ? t('Rückgabe bestätigen', 'Acknowledge return') : t('Rückgabe ablehnen', 'Reject return')} fields={[{ key: 'notes', label: t('Prüfnotiz / Begründung', 'Inspection notes / reason'), required: !decision.accept, multiline: true }]} onClose={() => setDecision(null)} onSave={(values) => (decision.accept ? acknowledge : reject).mutateAsync({ id: decision.id, notes: String(values.notes || '') })} />}
    </Box>
  );
}
