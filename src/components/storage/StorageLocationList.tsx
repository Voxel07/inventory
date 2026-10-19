import { useMemo, useState, type ReactNode } from 'react';
import { Box, Checkbox, Chip, Collapse, FormControlLabel, List, ListItemText, MenuItem, Stack, TextField, ToggleButtonGroup, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ViewListIcon from '@mui/icons-material/ViewList';
import { IconButton, ListItemButton, ToggleButton } from '../shared/ActionButtons';
import { LoadMore } from '../shared/LoadMore';
import { usePagedList } from '../../hooks/usePagedList';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { storageLocationApi } from '../../services/storageLocationService';
import { useUIStore } from '../../store/uiStore';
import type { StorageLocation } from '../../types';
import { buildLocationTree, filterLocationTree, flattenLocationTree, locationPath, locationRole, type LocationTreeNode } from '../../utils/locationHierarchy';
import { translate, useT } from '../../utils/naming';

const selectedSx = {
  '&.Mui-selected': { backgroundColor: 'rgba(124, 77, 255, 0.08)', '&:hover': { backgroundColor: 'rgba(124, 77, 255, 0.15)' } },
};

function matchesSearch(location: StorageLocation, needle: string): boolean {
  return [location.name, location.fullCode, location.description ?? ''].some((value) => value.toLowerCase().includes(needle));
}

/** Locations of the storage page, grouped by top-level location (tree) or as one flat, paged list. */
export function StorageLocationList({ locations, loading, selectedId, onSelect }: {
  /** Complete location list including inactive ones (the grouped view and the location filter). */
  locations: StorageLocation[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const view = useUIStore((s) => s.storageLocationView);
  const setView = useUIStore((s) => s.setStorageLocationView);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [siteFilter, setSiteFilter] = useState('');
  const search = useDebouncedValue(searchQuery.trim());
  const sites = locations.filter((location) => location.depth === 0 && (showInactive || location.active)).sort((a, b) => a.name.localeCompare(b.name));

  return <Stack sx={{ minHeight: 0, flexGrow: 1 }}>
    <TextField label={t('pages.storageLocations.searchStorageLocations')} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)}
      size="small" fullWidth sx={{ mb: 1.5 }} />
    <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1.5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, value: typeof view | null) => { if (value) setView(value); }}
        aria-label={t('pages.storageLocations.listView')}>
        <ToggleButton value="grouped" title={translate('pages.storageLocations.groupByLocation')}><AccountTreeIcon fontSize="small" sx={{ mr: 0.5 }} />{t('pages.storageLocations.grouped')}</ToggleButton>
        <ToggleButton value="flat" title={translate('pages.storageLocations.showAllInOneList')}><ViewListIcon fontSize="small" sx={{ mr: 0.5 }} />{t('pages.storageLocations.flat')}</ToggleButton>
      </ToggleButtonGroup>
      <FormControlLabel label={t('pages.storageLocations.showInactive')} sx={{ mr: 0 }}
        control={<Checkbox size="small" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />} />
    </Stack>
    {view === 'flat' && <TextField select size="small" label={t('pages.storageLocations.location')} value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} sx={{ mb: 1.5 }}>
      <MenuItem value="">{t('common.all')}</MenuItem>
      {sites.map((site) => <MenuItem key={site.id} value={site.id}>{site.name}</MenuItem>)}
    </TextField>}
    {view === 'grouped'
      ? <GroupedLocations locations={locations} loading={loading} search={search.toLowerCase()} showInactive={showInactive} selectedId={selectedId} onSelect={onSelect} />
      : <FlatLocations search={search} showInactive={showInactive} siteId={siteFilter} selectedId={selectedId} onSelect={onSelect} />}
  </Stack>;
}

function roleLabel(t: ReturnType<typeof useT>, location: StorageLocation) {
  return location.active ? t(`pages.storageLocations.role.${locationRole(location)}`) : t('common.inactive');
}

function GroupedLocations({ locations, loading, search, showInactive, selectedId, onSelect }: {
  locations: StorageLocation[];
  loading: boolean;
  search: string;
  showInactive: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const tree = useMemo(() => {
    const visible = buildLocationTree(locations.filter((location) => showInactive || location.active));
    return search ? filterLocationTree(visible, (location) => matchesSearch(location, search)) : visible;
  }, [locations, search, showInactive]);
  // Locations start open, sections and places closed; searching or selecting opens the path.
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const selectedPath = useMemo(() => {
    const path = new Set<string>();
    let current = locations.find((location) => location.id === selectedId);
    while (current?.parentLocationId && !path.has(current.parentLocationId)) {
      path.add(current.parentLocationId);
      current = locations.find((location) => location.id === current?.parentLocationId);
    }
    return path;
  }, [locations, selectedId]);
  const isOpen = (node: LocationTreeNode) => Boolean(search) || selectedPath.has(node.location.id)
    || (node.location.depth === 0) !== toggled.has(node.location.id);
  const toggle = (id: string) => setToggled((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  if (loading) return <Typography sx={{ p: 2 }}>{t('pages.storageLocations.loadingStorageLocations')}</Typography>;
  if (tree.length === 0) return <Typography sx={{ p: 2 }} color="text.secondary">{t('pages.storageLocations.noStorageLocationsFound')}</Typography>;

  const renderNode = (node: LocationTreeNode, level: number): ReactNode => {
    const { location } = node;
    const open = isOpen(node);
    const places = flattenLocationTree(node).length - 1;
    const root = level === 0;
    return <Box key={location.id} sx={root ? { mb: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' } : undefined}>
      <ListItemButton title={translate('pages.storageLocations.displayThisStorageLocationSDetailsAndStock')} selected={selectedId === location.id}
        onClick={() => onSelect(location.id)}
        sx={{ pl: 0.5 + level * 2, py: root ? 1 : 0.25, gap: 0.5, ...(root ? { bgcolor: 'action.hover' } : {}), ...selectedSx }}>
        <IconButton size="small" title={open ? t('pages.storageLocations.collapse') : t('pages.storageLocations.expand')}
          onClick={(event) => { event.stopPropagation(); toggle(location.id); }}
          sx={{ visibility: node.children.length ? 'visible' : 'hidden' }}>
          {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </IconButton>
        <ListItemText sx={{ my: 0, minWidth: 0 }}
          primary={<Typography variant={root ? 'subtitle1' : 'body2'} sx={{ fontWeight: root ? 700 : 500 }} noWrap
            color={location.active ? undefined : 'text.disabled'}>{location.name}</Typography>}
          secondary={<Typography variant="caption" color="text.secondary" noWrap component="span" sx={{ display: 'block' }}>
            <Box component="span" className="mono" sx={{ color: 'primary.main' }}>{location.fullCode}</Box>
            {root && ` · ${t('pages.storageLocations.sectionsAndPlaces', { sections: node.children.length, places: places - node.children.length })}`}
          </Typography>} />
        {!root && node.children.length > 0 && <Chip size="small" label={places} sx={{ flexShrink: 0 }} />}
        {!location.active && <Chip size="small" variant="outlined" label={roleLabel(t, location)} sx={{ flexShrink: 0 }} />}
      </ListItemButton>
      <Collapse in={open} unmountOnExit>{node.children.map((child) => renderNode(child, level + 1))}</Collapse>
    </Box>;
  };
  return <List disablePadding sx={{ overflowY: 'auto', flexGrow: 1 }}>{tree.map((node) => renderNode(node, 0))}</List>;
}

function FlatLocations({ search, showInactive, siteId, selectedId, onSelect }: {
  search: string;
  showInactive: boolean;
  siteId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const filters = { includeInactive: showInactive, search: search || undefined, subtreeId: siteId || undefined };
  const list = usePagedList(['storageLocations', 'list', filters], (page, size) => storageLocationApi.getPage(filters, page, size));
  const locations = list.data ?? [];
  if (list.isLoading) return <Typography sx={{ p: 2 }}>{t('pages.storageLocations.loadingStorageLocations')}</Typography>;
  if (locations.length === 0) return <Typography sx={{ p: 2 }} color="text.secondary">{t('pages.storageLocations.noStorageLocationsFound')}</Typography>;
  return <>
    <List sx={{ overflowY: 'auto', flexGrow: 1, px: 0 }}>
      {locations.map((location) => <ListItemButton key={location.id} title={translate('pages.storageLocations.displayThisStorageLocationSDetailsAndStock')}
        selected={selectedId === location.id} onClick={() => onSelect(location.id)}
        sx={{ borderRadius: 2, mb: 1, border: '1px solid', borderColor: selectedId === location.id ? 'primary.main' : 'divider', gap: 1, ...selectedSx }}>
        <ListItemText sx={{ my: 0, minWidth: 0 }}
          primary={<Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>{location.name}</Typography>}
          secondary={<Typography variant="body2" color="text.secondary" noWrap component="span" sx={{ display: 'block' }}>
            <Box component="span" className="mono" sx={{ color: 'primary.main' }}>{location.fullCode}</Box> · {locationPath(location, locations)}
          </Typography>} />
        <Chip size="small" variant="outlined" label={roleLabel(t, location)} sx={{ flexShrink: 0 }} />
      </ListItemButton>)}
    </List>
    <LoadMore list={list} />
  </>;
}
