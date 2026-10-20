import { useEffect, useState } from 'react';
import { Box, DialogActions, DialogContent, DialogTitle, TextField, ToggleButtonGroup, Typography } from '@mui/material';
import { DataGrid, type GridColDef, type GridRowSelectionModel } from '@mui/x-data-grid';
import { deDE, enUS } from '@mui/x-data-grid/locales';
import AddIcon from '@mui/icons-material/Add';
import { Dialog } from '../shared/ClosableDialog';
import { Button, ToggleButton } from '../shared/ActionButtons';
import { catalogGridSx } from '../lists/catalogGrid';
import { usePagedItems } from '../../hooks/useItems';
import { usePagedAssemblies } from '../../hooks/useAssemblies';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getItemStock, stockRatio } from '../../utils/stock';
import { useAppLanguage, useT } from '../../utils/naming';
import type { Assembly, Item } from '../../types';

type Kind = 'items' | 'assemblies';
type PickerRow = { id: string; name: string; detail: string; available?: string };

/** Pages of a server list keep loading in the background, as in the catalog list. */
function useLoadAll(list: { hasNextPage: boolean; isFetchingNextPage: boolean; isFetchNextPageError: boolean; fetchNextPage: () => unknown }, enabled: boolean) {
  const loadNext = enabled && list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError;
  const fetchNextPage = list.fetchNextPage;
  useEffect(() => {
    if (loadNext) void fetchNextPage();
  }, [loadNext, fetchNextPage]);
}

/**
 * Searches items and assemblies and adds the selection to an event: each item counts once, each assembly
 * adds its components with their per-assembly quantities.
 */
export function AddEventItemsDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (quantities: Record<string, number>) => void }) {
  const t = useT();
  const language = useAppLanguage();
  const [kind, setKind] = useState<Kind>('items');
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState<Map<string, Item>>(new Map());
  const [selectedAssemblies, setSelectedAssemblies] = useState<Map<string, Assembly>>(new Map());
  const term = useDebouncedValue(search.trim()) || undefined;
  const items = usePagedItems({ search: term, sort: 'name' }, { enabled: open && kind === 'items' });
  const assemblies = usePagedAssemblies({ search: term }, { enabled: open && kind === 'assemblies' });
  useLoadAll(items, open && kind === 'items');
  useLoadAll(assemblies, open && kind === 'assemblies');

  const itemRows: PickerRow[] = (items.data ?? []).map((item) => {
    const stock = getItemStock(item);
    return { id: item.id, name: item.name, detail: [item.category, item.subcategory].filter(Boolean).join(' · '),
      available: stockRatio(stock.remaining, stock.totalStock, item.isConsumable, item) };
  });
  const assemblyRows: PickerRow[] = (assemblies.data ?? []).map((assembly) => ({ id: assembly.id, name: assembly.name,
    // List pages may omit expanded components; the count still tells assemblies apart.
    detail: assembly.expand?.itemIds?.length
      ? assembly.expand.itemIds.map((item) => `${assembly.itemQuantities?.[item.id] ?? 1}× ${item.name}`).join(', ')
      : `${assembly.itemIds.length} ${t('common.items')}` }));
  const list = kind === 'items' ? items : assemblies;
  const rows = kind === 'items' ? itemRows : assemblyRows;
  const selectedIds = new Set(kind === 'items' ? selectedItems.keys() : selectedAssemblies.keys());
  const selectedCount = selectedItems.size + selectedAssemblies.size;

  const columns: GridColDef<PickerRow>[] = [
    { field: 'name', headerName: t('profile.name'), flex: 1, minWidth: 180,
      renderCell: ({ row }) => <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'normal', lineHeight: 1.3 }}>{row.name}</Typography> },
    { field: 'detail', headerName: kind === 'items' ? t('common.category') : t('nav.items'), flex: 1.4, minWidth: 180,
      renderCell: ({ row }) => <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'normal', lineHeight: 1.3 }}>{row.detail || '—'}</Typography> },
    ...(kind === 'items' ? [{ field: 'available', headerName: t('enum.itemStatus.available'), width: 170 } satisfies GridColDef<PickerRow>] : []),
  ];

  function updateSelection(model: GridRowSelectionModel) {
    const ids = model.type === 'exclude' ? rows.map((row) => row.id).filter((id) => !model.ids.has(id)) : [...model.ids].map(String);
    if (kind === 'items') {
      const byId = new Map((items.data ?? []).map((item) => [item.id, item]));
      const next = new Map<string, Item>();
      ids.forEach((id) => { const item = selectedItems.get(id) ?? byId.get(id); if (item) next.set(id, item); });
      setSelectedItems(next);
    } else {
      const byId = new Map((assemblies.data ?? []).map((assembly) => [assembly.id, assembly]));
      const next = new Map<string, Assembly>();
      ids.forEach((id) => { const assembly = selectedAssemblies.get(id) ?? byId.get(id); if (assembly) next.set(id, assembly); });
      setSelectedAssemblies(next);
    }
  }

  function close() {
    setSelectedItems(new Map());
    setSelectedAssemblies(new Map());
    setSearch('');
    onClose();
  }

  function add() {
    const quantities: Record<string, number> = {};
    selectedItems.forEach((_item, id) => { quantities[id] = (quantities[id] ?? 0) + 1; });
    selectedAssemblies.forEach((assembly) => assembly.itemIds.forEach((id) => {
      quantities[id] = (quantities[id] ?? 0) + (assembly.itemQuantities?.[id] ?? 1);
    }));
    onAdd(quantities);
    close();
  }

  return <Dialog open={open} onClose={close} fullWidth maxWidth="md">
    <DialogTitle>{t('pages.eventDetail.addItems')}</DialogTitle>
    <DialogContent dividers>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
        <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_event, value: Kind | null) => value && setKind(value)}>
          <ToggleButton value="items">{t('nav.items')}</ToggleButton>
          <ToggleButton value="assemblies">{t('nav.assemblies')}</ToggleButton>
        </ToggleButtonGroup>
        <TextField type="search" size="small" autoFocus sx={{ flex: 1, minWidth: 220 }} value={search} onChange={(event) => setSearch(event.target.value)}
          label={kind === 'items' ? t('lists.itemsList.searchByName') : t('pages.eventDetail.searchAssemblies')} />
      </Box>
      <DataGrid rows={rows} columns={columns} checkboxSelection keepNonExistentRowsSelected disableRowSelectionOnClick={false}
        rowSelectionModel={{ type: 'include', ids: selectedIds }} onRowSelectionModelChange={updateSelection}
        loading={list.isLoading} density="compact" getRowHeight={() => 'auto'} autoHeight
        initialState={{ pagination: { paginationModel: { page: 0, pageSize: 25 } } }} pageSizeOptions={[25, 50, 100]}
        localeText={language === 'de' ? deDE.components.MuiDataGrid.defaultProps.localeText : enUS.components.MuiDataGrid.defaultProps.localeText}
        sx={catalogGridSx} />
      {list.isFetchingNextPage && <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 1 }}>{t('lists.itemsList.loadingMoreEntries')}</Typography>}
    </DialogContent>
    <DialogActions>
      <Button onClick={close}>{t('common.cancel')}</Button>
      <Button variant="contained" startIcon={<AddIcon />} disabled={!selectedCount} onClick={add}>
        {t('pages.eventDetail.addSelectedCount', { count: selectedCount })}
      </Button>
    </DialogActions>
  </Dialog>;
}
