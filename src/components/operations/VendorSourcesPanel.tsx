import { useState } from 'react';
import { Alert, Box, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button, ListItemButton } from '../shared/ActionButtons';
import { ListPagination } from '../shared/ListPagination';
import { QueryFeedback } from '../common/QueryFeedback';
import { catalogGridSx } from '../lists/catalogGrid';
import { useCompactCatalog } from '../../hooks/useCompactCatalog';
import { PurchaseLink } from '../items/PurchaseLink';
import { useOperationCommand } from '../../hooks/useOperations';
import { getVendorSources, scanVendorSources, type VendorSourceGroup, type VendorSourceItem } from '../../services/procurementService';
import { queryKeys } from '../../utils/queryKeys';
import { formatDateTime } from '../../utils/dateFormat';
import { useAppLanguage, useT } from '../../utils/naming';

/** Suppliers derived from item purchase links; the scan runs only when the button is pressed. */
export function VendorSourcesPanel() {
  const t = useT();
  const sources = useQuery({ queryKey: queryKeys.operations('vendor-sources'), queryFn: getVendorSources });
  const command = useOperationCommand();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const data = sources.data;
  const selected = data?.vendors.find(group => group.vendorId === vendorId);
  const vendors = data?.vendors.filter(group => `${group.vendorName} ${group.host}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
      <Button variant="contained" title={t('operations.vendorSources.generateTitle')} disabled={command.isPending || sources.isLoading}
        sx={{ flexShrink: 0, whiteSpace: 'normal' }}
        onClick={() => command.mutate(() => scanVendorSources())}>
        {command.isPending ? t('operations.vendorSources.generating') : t('operations.vendorSources.generate')}
      </Button>
      {data && (data.lastScannedAt == null
        ? <Typography>{t('operations.vendorSources.neverRun')}</Typography>
        : <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Typography sx={{ fontWeight: 600 }}>{t('operations.vendorSources.lastRun', { date: formatDateTime(data.lastScannedAt), name: data.lastScannedBy ?? '—' })}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('operations.vendorSources.summary', { items: data.linkedItems, created: data.createdVendors })}
            {data.skippedItems > 0 && ` · ${t('operations.vendorSources.skipped', { count: data.skippedItems })}`}
          </Typography>
        </Box>)}
    </Stack>
    {data && data.changedLinks > 0 && <Alert severity="info">{t('operations.vendorSources.changedLinks', { count: data.changedLinks })}</Alert>}
    {command.error && <Alert severity="error">{command.error.message}</Alert>}
    <QueryFeedback isLoading={sources.isLoading} error={sources.error} isEmpty={!!data && !data.vendors.length} emptyMessage={t('operations.vendorSources.empty')} />
    {selected ? <>
      <Box><Button startIcon={<ArrowBackIcon />} onClick={() => setVendorId(null)}>{t('operations.vendorSources.backToVendors')}</Button></Box>
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{selected.vendorName}</Typography>
        <PurchaseLink url={`https://${selected.host}`} label={selected.host} />
      </Stack>
      <VendorSourceItems key={selected.vendorId} group={selected} />
    </> : !!data?.vendors.length && <>
      <TextField type="search" size="small" fullWidth label={t('operations.vendorSources.searchVendors')} value={search} onChange={event => setSearch(event.target.value)} />
      <QueryFeedback isLoading={false} isEmpty={!vendors?.length} emptyMessage={t('operations.vendorSources.noMatchingVendors')} />
      {!!vendors?.length && <Paper variant="outlined" component="ul" aria-label={t('common.supplier')} sx={{ listStyle: 'none', m: 0, p: 0, overflow: 'hidden' }}>
        {vendors.map(group => <Box component="li" key={group.vendorId} sx={{ borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
          <ListItemButton onClick={() => setVendorId(group.vendorId)} sx={{ gap: 1, minHeight: 48 }}>
            <Stack direction="row" useFlexGap sx={{ flex: 1, minWidth: 0, gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>{group.vendorName}</Typography>
              {group.generated && <Chip size="small" label={t('operations.vendorSources.generated')} />}
              {!group.active && <Chip size="small" label={t('enum.value.inactive')} />}
              <Typography variant="body2" color="text.secondary">{t('operations.vendorSources.itemCount', { count: group.items.length })}</Typography>
            </Stack>
            <ChevronRightIcon sx={{ flexShrink: 0 }} />
          </ListItemButton>
          <Box sx={{ px: 2, pb: 1, minWidth: 0 }}><PurchaseLink url={`https://${group.host}`} label={group.host} /></Box>
        </Box>)}
      </Paper>}
    </>}
  </Stack>;
}

/** Search the supplier's scanned items; phones use compact rows with the same pagination. */
function VendorSourceItems({ group }: { group: VendorSourceGroup }) {
  const t = useT();
  const language = useAppLanguage();
  const compact = useCompactCatalog();
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 0, pageSize: 25 });
  const rows = group.items.filter(item => `${item.itemName} ${item.sku} ${item.url}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const page = Math.min(pagination.page, Math.max(0, Math.ceil(rows.length / pagination.pageSize) - 1));
  const link = (item: VendorSourceItem) => <Stack spacing={0.25} sx={{ minWidth: 0, maxWidth: '100%' }}>
    <PurchaseLink url={item.url} label={item.url.replace(/^https?:\/\/(www\.)?/i, '')} />
    {item.currentUrl !== item.url && <Typography variant="caption" color="warning.main">
      {item.currentUrl ? t('operations.vendorSources.linkChanged') : t('operations.vendorSources.linkRemoved')}
    </Typography>}
  </Stack>;
  const columns: GridColDef<VendorSourceItem>[] = [
    { field: 'itemName', headerName: t('common.item'), flex: 1, minWidth: 180,
      renderCell: ({ row }) => <Link to={`/items/${row.itemId}`}>{row.itemName}</Link> },
    { field: 'sku', headerName: 'SKU', width: 150 },
    { field: 'url', headerName: t('operations.vendorSources.link'), flex: 1.5, minWidth: 200, renderCell: ({ row }) => link(row) },
  ];
  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <TextField type="search" size="small" fullWidth label={t('common.searchItems')} value={search}
      onChange={event => { setSearch(event.target.value); setPagination(current => ({ ...current, page: 0 })); }} />
    {compact ? <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <QueryFeedback isLoading={false} isEmpty={!rows.length} emptyMessage={t('lists.itemsList.noMatchingItems')} />
      <Box component="ul" aria-label={t('operations.vendorSources.itemsToOrder')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {rows.slice(page * pagination.pageSize, (page + 1) * pagination.pageSize).map(item => <Box component="li" key={item.itemId}
          sx={{ p: 1.5, minWidth: 0, borderBottom: 1, borderColor: 'divider' }}>
          <Typography component={Link} to={`/items/${item.itemId}`} sx={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere', py: 0.5 }}>{item.itemName}</Typography>
          {item.sku && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{item.sku}</Typography>}
          {link(item)}
        </Box>)}
      </Box>
      <ListPagination count={rows.length} page={page + 1} pageSize={pagination.pageSize} pageSizeOptions={[25, 50, 100]}
        onChange={next => setPagination(current => ({ ...current, page: next - 1 }))}
        onPageSizeChange={pageSize => setPagination({ page: 0, pageSize })} />
    </Paper> : <DataGrid rows={rows} columns={columns} getRowId={row => row.itemId} density="compact" getRowHeight={() => 'auto'} autoHeight
      disableRowSelectionOnClick paginationModel={{ ...pagination, page }} onPaginationModelChange={setPagination} pageSizeOptions={[25, 50, 100]}
      localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
      sx={catalogGridSx} />}
  </Stack>;
}
