import { InventorySharing } from '../components/items/InventorySharing';
import { Button, ListItemButton, IconButton, Tab } from '../components/shared/ActionButtons';
import { Tabs } from '@mui/material';
import { StorageResponsibilities } from '../components/operations/StorageResponsibilities';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { WarehousesPanel } from '../components/operations/WarehousesPanel';
import { getWarehouses } from '../services/warehouseService';
import { locationPath, locationLabel, isDescendant } from '../utils/locationHierarchy';
import { useAuth } from '../hooks/useAuth';
import { canCreateInventory, canEditCatalog, canViewOrganization } from '../utils/access';
import { ItemsList } from '../components/lists/ItemsList';
import { getLocationInventory } from '../utils/locationStock';
import { useQuery } from '@tanstack/react-query';
import { storageLocationApi } from '../services/storageLocationService';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { PagedAutocomplete } from '../components/shared/PagedAutocomplete';
import { mapPage } from '../services/apiPagination';
import { LoadMore } from '../components/shared/LoadMore';
import { operationsApi } from '../services/operationsService';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import { Alert, MenuItem, Checkbox, FormControlLabel, Box, Typography, Paper, List, ListItemText, Grid, TextField, DialogTitle, DialogContent, DialogActions, Chip, Stack, Divider, useTheme, useMediaQuery } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RoomIcon from '@mui/icons-material/Room';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MapIcon from '@mui/icons-material/Map';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStorageLocation, useCreateStorageLocation, useUpdateStorageLocation, useDeleteStorageLocation } from '../hooks/useStorageLocations';
import { useItemsByIds } from '../hooks/useItems';
import { usePagedList, useCompleteList } from '../hooks/usePagedList';
import { queryKeys } from '../utils/queryKeys';
import { useUIStore } from '../store/uiStore';
import type { StorageLocation } from '../types';
import { translate, useT } from '../utils/naming';
import type { StorageLocationFormData } from '../types';
import { StorageLocationMap } from '../components/maps/StorageLocationMap';
import { apiFileUrl } from '../services/apiClient';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { formatStatus } from '../utils/formatters';

export function StorageLocations() {
    const t = useT();
    const { user } = useAuth();
    const canEdit = canEditCatalog(user);
    const canCreate = canCreateInventory(user);
    // Tenants keep their buildings outside of the organization's warehouses.
    const organization = canViewOrganization(user);
    const navigate = useNavigate();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));


    const createMutation = useCreateStorageLocation();
    const updateMutation = useUpdateStorageLocation();
    const deleteMutation = useDeleteStorageLocation();

    const [searchParams, setSearchParams] = useSearchParams();
    const selectedLocId = searchParams.get('locationId');
    function setSelectedLocId(id: string | null) {
        setSearchParams(current => {
            const next = new URLSearchParams(current);
            if (id) next.set('locationId', id);
            else next.delete('locationId');
            return next;
        });
    }
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingLoc, setEditingLoc] = useState<StorageLocation | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [warehouseFilter, setWarehouseFilter] = useState('');
    const [parentFilter, setParentFilter] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [warehousesOpen, setWarehousesOpen] = useState(false);
    const [tab, setTab] = useState('locations');
    const warehouses = useCompleteList(['operations', 'warehouses'], getWarehouses, { enabled: organization });
    const search = useDebouncedValue(searchQuery.trim());
    const locationFilters = tab === 'responsibilities' ? { includeInactive: false } : { includeInactive: showInactive, search: search || undefined, warehouseId: warehouseFilter || undefined, subtreeId: parentFilter || undefined };
    const locationList = usePagedList(['storageLocations', 'list', locationFilters], (page, size) => storageLocationApi.getPage(locationFilters, page, size));
    const { data: locations, isLoading: locationsLoading, error: locationsError, refetch: refetchLocations } = locationList;
    const selectedLocation = useStorageLocation(selectedLocId ?? undefined);
    // The edit dialog explicitly needs the hierarchy to exclude descendant parent choices.
    // The edit dialog needs the hierarchy to exclude descendant parent choices; the detail panel lists children.
    const hierarchy = useQuery({ queryKey: ['storageLocations', 'hierarchy'], enabled: dialogOpen || Boolean(selectedLocId),
      queryFn: () => storageLocationApi.getAll({ includeInactive: true }), networkMode: 'offlineFirst' });
    const locationOptions = async (needle: string, page: number, size: number) =>
      mapPage(await storageLocationApi.getPage({ includeInactive: true, search: needle || undefined, warehouseId: warehouseFilter || undefined }, page, size),
        location => ({ value: location.id, label: locationLabel(location) }));

    const [formData, setFormData] = useState<StorageLocationFormData>({
        name: '',
        code: '',
        description: '',
        latitude: 52.375953,
        longitude: 11.826278,
        mapZoom: 19,
    });
    const overlayPreview = useObjectUrl(dialogOpen ? formData.mapOverlayFile : undefined);

    const activeLocation = selectedLocation.data ?? locations?.find((l) => l.id === selectedLocId) ?? null;



    // One location's stock is bounded: read all of it, then exactly the items stored there.
    const positions = useCompleteList(queryKeys.operations(`storage-positions:${selectedLocId}`), operationsApi.positions({ locationId: selectedLocId ?? undefined }), { enabled: Boolean(selectedLocId) });
    const locatedAssets = useCompleteList(queryKeys.operations(`storage-assets:${selectedLocId}`), operationsApi.assets({ locationId: selectedLocId ?? undefined }), { enabled: Boolean(selectedLocId) });
    const itemQuery = useItemsByIds([...(positions.data ?? []).map((position) => position.itemId), ...(locatedAssets.data ?? []).map((asset) => asset.itemId)]);

    const inventory = getLocationInventory(itemQuery.data ?? [], positions.data ?? [], locatedAssets.data ?? [], selectedLocId);
    const inventoryLoading = itemQuery.isLoading || positions.isLoading || locatedAssets.isLoading;
    const inventoryError = itemQuery.error || positions.error || locatedAssets.error;
    const inventoryLoadingMore = false;
    function retryInventory() {
        void itemQuery.refetch();
        void positions.refetch();
        void locatedAssets.refetch();
    }

    /** Next level below `parent` by default: warehouse → area → section → shelf → compartment. */
    const childType: Partial<Record<NonNullable<StorageLocation['locationType']>, StorageLocation['locationType']>> = { warehouse: 'area', area: 'section', section: 'shelf', shelf: 'compartment' };

    function handleOpenCreate(parent?: StorageLocation) {
        setEditingLoc(null);
        // Staff add shared locations by default; members and children of private locations are private.
        setFormData({ privateResource: !canEdit || Boolean(parent?.access?.privateResource), warehouseId: parent?.warehouseId ?? null, parentLocationId: parent?.id ?? null,
            locationType: parent ? childType[parent.locationType ?? 'bin'] ?? 'bin' : 'warehouse', active: true, name: '', code: '', description: '',
            latitude: parent?.latitude ?? 52.375953, longitude: parent?.longitude ?? 11.826278, mapZoom: Math.max(parent?.mapZoom ?? 19, 19) });
        setDialogOpen(true);
    }

    function handleOpenEdit(loc: StorageLocation, e?: React.MouseEvent) {
        e?.stopPropagation();
        setEditingLoc(loc);
        setFormData({
            privateResource: Boolean(loc.access?.privateResource), warehouseId: loc.warehouseId ?? null, parentLocationId: loc.parentLocationId ?? null, locationType: loc.locationType, active: loc.active,
            name: loc.name,
            code: loc.code,
            mapOverlay: loc.mapOverlay ?? null,
            description: loc.description || '',
            latitude: loc.latitude ?? 52.375953,
            longitude: loc.longitude ?? 11.826278,
            mapZoom: Math.max(loc.mapZoom ?? 19, 19),
            overlayBounds: loc.overlayBounds,
        });
        setDialogOpen(true);
    }

    function handleOpenDelete(locId: string, e: React.MouseEvent) {
        e.stopPropagation();
        setSelectedLocId(locId);
        setDeleteConfirmOpen(true);
    }

    const children = (hierarchy.data ?? []).filter((location) => location.parentLocationId === selectedLocId)
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    const parentIsPrivate = Boolean(hierarchy.data?.find((l) => l.id === formData.parentLocationId)?.access?.privateResource);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.name) return;

        if (editingLoc) {
            updateMutation.mutate(
                { id: editingLoc.id, data: formData },
                {
                    onSuccess: () => {
                        setDialogOpen(false);
                        showSnackbar(t('pages.storageLocations.storageLocationUpdatedSuccessfully'), 'success');
                    },
                    onError: (error) => showSnackbar(error.message, 'error'),
                }
            );
        } else {
            createMutation.mutate(formData, {
                onSuccess: (newLoc) => {
                    setDialogOpen(false);
                    setSelectedLocId(newLoc.id);
                    showSnackbar(t('pages.storageLocations.storageLocationCreatedSuccessfully'), 'success');
                },
                onError: (error) => showSnackbar(error.message, 'error'),
            });
        }
    }

    function handleDeleteConfirm() {
        if (!selectedLocId) return;
        deleteMutation.mutate(selectedLocId, {
            onSuccess: () => {
                setDeleteConfirmOpen(false);
                setSelectedLocId(null);
                showSnackbar(t('pages.storageLocations.storageLocationDeactivated'), 'success');
            },
            onError: (error) => showSnackbar(error.message, 'error'),
        });
    }

    return (
        <Box>
            {(locationsError || selectedLocation.error || hierarchy.error) && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => { void refetchLocations(); }}>{t('common.retry')}</Button>}>{(locationsError || selectedLocation.error || hierarchy.error)?.message}</Alert>}
            <Dialog open={warehousesOpen} onClose={() => setWarehousesOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t('pages.storageLocations.warehouses')}</DialogTitle><DialogContent><WarehousesPanel /></DialogContent><DialogActions><Button title={translate('common.closeThisDialog')} onClick={() => setWarehousesOpen(false)}>{t('common.close')}</Button></DialogActions></Dialog>
            {(tab !== 'locations' || !isMobile || !selectedLocId) && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="h4">
                        {t('nav.storageLocations')}
                    </Typography>
                    {canCreate && <Button title={translate('pages.storageLocations.createANewStorageLocation')}
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenCreate()}
                    >
                        {t('pages.storageLocations.addStorageLocation')}
                    </Button>}
                </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                <Tabs value={tab} onChange={(_, value: string) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ minWidth: 0, maxWidth: '100%' }} aria-label={t('pages.storageLocations.storageLocationSections')}>
                    <Tab value="locations" label={t('pages.storageLocations.locationsStock')} id="storage-tab-locations" aria-controls="storage-panel-locations" />
                    {canEdit && <Tab value="responsibilities" label={t('pages.storageLocations.responsibilityMissingInformation')} id="storage-tab-responsibilities" aria-controls="storage-panel-responsibilities" />}
                </Tabs>
                <Button title={translate('pages.storageLocations.createAndEditWarehouses')} disabled={!canEdit} onClick={() => setWarehousesOpen(true)}>{t('pages.storageLocations.manageWarehouses')}</Button>
            </Box>
            {tab === 'responsibilities' && canEdit && !locationsError && <Box role="tabpanel" id="storage-panel-responsibilities" aria-labelledby="storage-tab-responsibilities">
                <StorageResponsibilities locations={locations ?? []} loading={locationsLoading} onEditLocation={handleOpenEdit} />
                <LoadMore list={locationList} />
            </Box>}
            <Box hidden={tab !== 'locations'} role="tabpanel" id="storage-panel-locations" aria-labelledby="storage-tab-locations">
            {isMobile && selectedLocId && (
                <Button title={translate('pages.storageLocations.returnToTheStorageLocationList')}
                    startIcon={<ArrowBackIcon />}
                    onClick={() => setSelectedLocId(null)}
                    sx={{ mb: 2 }}
                >
                    {t('pages.storageLocations.backToLocationList')}
                </Button>
            )}

            <Grid container spacing={3}>
                {/* Left Column: Locations List */}
                {(!isMobile || !selectedLocId) && (
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : 'calc(100vh - 180px)', overflowY: isMobile ? 'visible' : 'auto' }}>
                            <TextField
                                label={t('pages.storageLocations.searchStorageLocations')}
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); }}
                                size="small"
                                fullWidth
                                sx={{ mb: 2 }}
                            />

                            <Stack spacing={1} sx={{ mb: 2 }}>
                              <TextField select size="small" label={t('pages.storageLocations.warehouse')} value={warehouseFilter} onChange={(e) => { setWarehouseFilter(e.target.value); setParentFilter(''); }}><MenuItem value="">{t('common.all')}</MenuItem>{warehouses.data?.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}</TextField>
                              <PagedAutocomplete size="small" label={t('pages.storageLocations.locationSubtree')} value={parentFilter}
                                queryKey={['storageLocations', 'subtree-picker', warehouseFilter]} getPage={locationOptions} onChange={setParentFilter} />
                              <FormControlLabel label={t('pages.storageLocations.showInactive')} control={<Checkbox checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); }} />} />
                            </Stack>
                            {locationsLoading ? (
                                <Typography sx={{ p: 2 }}>{t('pages.storageLocations.loadingStorageLocations')}</Typography>
                            ) : locations?.length === 0 ? (
                                <Typography sx={{ p: 2 }} color="text.secondary">
                                    {t('pages.storageLocations.noStorageLocationsFound')}
                                </Typography>
                            ) : (
                                <List sx={{ overflowY: isMobile ? 'visible' : 'auto', flexGrow: 1, px: 0 }}>
                                    {locations?.map((loc) => {
                                        return (
                                            <ListItemButton title={translate('pages.storageLocations.displayThisStorageLocationSDetailsAndStock')}
                                                key={loc.id}
                                                selected={selectedLocId === loc.id}
                                                onClick={() => { setSelectedLocId(loc.id); }}
                                                sx={{
                                                    borderRadius: 2,
                                                    mb: 1,
                                                    border: '1px solid transparent',
                                                    borderColor: selectedLocId === loc.id ? 'primary.main' : 'divider',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    '&.Mui-selected': {
                                                        backgroundColor: 'rgba(124, 77, 255, 0.08)',
                                                        '&:hover': {
                                                            backgroundColor: 'rgba(124, 77, 255, 0.15)',
                                                        },
                                                    },
                                                }}
                                            >
                                                <ListItemText
                                                    sx={{ my: 0, mr: 1, minWidth: 0 }}
                                                    primary={
                                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                                                            {loc.name}
                                                        </Typography>
                                                    }
                                                    secondary={
                                                        <Typography variant="body2" color="text.secondary" noWrap title={locationLabel(loc, locations ?? [])}>
                                                            <Box component="span" className="mono" sx={{ color: 'primary.main' }}>{loc.fullCode}</Box> · {locationPath(loc, locations ?? [])}
                                                        </Typography>
                                                    }
                                                />
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                                    <Chip
                                                        label={loc.active ? formatStatus(loc.locationType ?? 'bin') : t('common.inactive')}
                                                        size="small"
                                                        variant="outlined"
                                                    />

                                                    <IconButton title={t('common.edit')} size="small" disabled={!(loc.access?.privateResource ? loc.access.canEdit : canEdit)} onClick={(e) => handleOpenEdit(loc, e)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>

                                                    <IconButton title={t('pages.storageLocations.deactivate')} size="small" color="error" disabled={!(loc.access?.privateResource ? loc.access.canEdit : canEdit)} onClick={(e) => handleOpenDelete(loc.id, e)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </ListItemButton>
                                        );
                                    })}
                                </List>
                            )}
                            <LoadMore list={locationList} />
                        </Paper>
                    </Grid>
                )}

                {/* Right Column: Location Details & Stored Items */}
                {(!isMobile || Boolean(selectedLocId)) && (
                    <Grid size={{ xs: 12, md: 8 }}>
                        {activeLocation && <InventorySharing kind="storage-locations" id={activeLocation.id} access={activeLocation.access} />}
                        {activeLocation ? (
                            <Paper sx={{ p: { xs: 2, md: 3 }, height: isMobile ? 'auto' : 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', overflowY: isMobile ? 'visible' : 'auto' }}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <RoomIcon color="primary" sx={{ fontSize: 32 }} />
                                        <Box>
                                            <Typography variant="h5">
                                                {locationPath(activeLocation, locations ?? [])}
                                            </Typography>
                                            <Typography variant="subtitle2" color="text.secondary" className="mono">{activeLocation.fullCode}</Typography>
                                        </Box>
                                    </Box>
                                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
                                        {canCreate && activeLocation.active && <Button size="small" variant="outlined" startIcon={<AddIcon />} title={t('pages.storageLocations.addALocationInsideThisOne')}
                                            onClick={() => handleOpenCreate(activeLocation)}>
                                            {t('pages.storageLocations.addSubLocation')}
                                        </Button>}
                                        <Button size="small" title={t('pages.storageLocations.openLabelsScanningAndTransfersForThisLocation')}
                                            onClick={() => navigate(`/locations/${activeLocation.id}`)}>
                                            {t('pages.storageLocations.labelsScanTransfer')}
                                        </Button>
                                        <Button title={translate('pages.storageLocations.editThisStorageLocationSDetails')}
                                            size="small"
                                            variant="outlined"
                                            startIcon={<EditIcon />}
                                            disabled={!(activeLocation.access?.privateResource ? activeLocation.access.canEdit : canEdit)} onClick={(e) => handleOpenEdit(activeLocation, e)}
                                        >
                                            {t('common.edit')}
                                        </Button>
                                    </Stack>
                                </Box>

                                {activeLocation.description && (
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, pl: { xs: 0, md: 6 } }}>
                                        {activeLocation.description}
                                    </Typography>
                                )}

                                {activeLocation.latitude != null && activeLocation.longitude != null && (
                                    <Box sx={{ mb: 2 }}>
                                        <StorageLocationMap
                                            compact
                                            latitude={activeLocation.latitude}
                                            longitude={activeLocation.longitude}
                                            zoom={activeLocation.mapZoom}
                                            overlayBounds={activeLocation.overlayBounds}
                                            overlayUrl={apiFileUrl(activeLocation.mapOverlay)}
                                        />
                                    </Box>
                                )}

                                {children.length > 0 && <Box sx={{ mb: 1 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('pages.storageLocations.subLocations')} ({children.length})</Typography>
                                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                        {children.map((child) => <Chip key={child.id} clickable variant={child.active ? 'outlined' : 'filled'} onClick={() => setSelectedLocId(child.id)}
                                            label={<><Box component="span" className="mono" sx={{ mr: 0.75 }}>{child.code}</Box>{child.name}</>} />)}
                                    </Stack>
                                </Box>}

                                <Divider sx={{ my: 2 }} />

                                <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                                    <Typography variant="h6">
                                        {t('pages.storageLocations.itemsStoredHere')}
                                    </Typography>
                                    <Chip size="small" label={inventory.items.length} />
                                </Stack>
                                {inventoryError && <Alert severity="error" sx={{ mb: 1 }} action={<Button size="small" onClick={retryInventory}>{t('common.retry')}</Button>}>
                                    {t('pages.storageLocations.couldNotLoadAllItemsStoredHere')}
                                </Alert>}
                                <ItemsList key={activeLocation.id} items={inventory.items} locationStock={inventory.stockByItemId}
                                    isLoading={inventoryLoading} loadingMore={inventoryLoadingMore} />
                            </Paper>
                        ) : (
                            <Paper
                                sx={{
                                    p: 3,
                                    height: 'calc(100vh - 180px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'background.paper',
                                }}
                            >
                                <Box sx={{ textAlign: 'center' }}>
                                    <RoomIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                                    <Typography color="text.secondary" variant="subtitle1">
                                        {t('pages.storageLocations.selectAStorageLocationFromTheListToViewIts')}
                                    </Typography>
                                </Box>
                            </Paper>
                        )}
                    </Grid>
                )}
            </Grid>
            </Box>

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} fullScreen={isMobile} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{editingLoc ? t('pages.storageLocations.editStorageLocation') : t('pages.storageLocations.newStorageLocation')}</DialogTitle>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogContent sx={{ pt: 1 }}>
                        <Stack spacing={2}>
                            <FormControlLabel control={<Checkbox checked={Boolean(formData.privateResource) || parentIsPrivate} disabled={Boolean(editingLoc) || !canEdit || parentIsPrivate}
                                onChange={(_, checked) => setFormData(prev => ({ ...prev, privateResource: checked }))} />} label={t('pages.storageLocations.privateStorageLocationOwnerInventoryAdminsAndExplicitSharesOnly')} />
                            {organization && <TextField select label={t('pages.storageLocations.warehouse')} value={formData.warehouseId ?? ''} onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value || null, parentLocationId: null })}><MenuItem value="">{t('pages.storageLocations.unassigned')}</MenuItem>{warehouses.data?.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}{w.active ? '' : ` (${t('pages.storageLocations.inactive')})`}</MenuItem>)}</TextField>}
                            <TextField select label={t('pages.storageLocations.parentLocation')} value={formData.parentLocationId ?? ''} onChange={(e) => {
                                const parentId = e.target.value || null;
                                // Shares flow down a private location tree, so children of private locations are private.
                                const privateParent = Boolean(hierarchy.data?.find((l) => l.id === parentId)?.access?.privateResource);
                                setFormData({ ...formData, parentLocationId: parentId, ...(privateParent ? { privateResource: true } : {}) });
                            }}><MenuItem value="">{t('pages.storageLocations.topLevel')}</MenuItem>{hierarchy.data?.filter((l) => (l.warehouseId ?? null) === (formData.warehouseId ?? null) && (!editingLoc || !isDescendant(l, editingLoc.id, hierarchy.data ?? []))).sort((a, b) => a.fullCode.localeCompare(b.fullCode, undefined, { numeric: true })).map((l) => <MenuItem key={l.id} value={l.id}>{locationLabel(l, hierarchy.data ?? [])}</MenuItem>)}</TextField>
                            <TextField select label={t('pages.storageLocations.locationType')} value={formData.locationType ?? 'bin'} onChange={(e) => setFormData({ ...formData, locationType: e.target.value as StorageLocation['locationType'] })}>{['warehouse', 'area', 'section', 'shelf', 'compartment', 'bin', 'staging', 'event_site', 'vehicle', 'in_custody', 'quarantine', 'repair', 'scrap'].map((type) => <MenuItem key={type} value={type}>{formatStatus(type)}</MenuItem>)}</TextField>
                            <FormControlLabel label={t('enum.value.active')} control={<Checkbox checked={formData.active ?? true} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} />} />
                            <Alert severity="info">{t('pages.storageLocations.inactiveLocationsRemainVisibleForStockAndHistoryDeactivateChild')}</Alert>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                <TextField
                                    label={t('pages.storageLocations.storageLocationName')}
                                    placeholder={t('pages.storageLocations.eGShelf3')}
                                    value={formData.name}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                                    required
                                    fullWidth
                                    autoFocus
                                />
                                <TextField
                                    label={t('forms.itemForm.locationCode')}
                                    placeholder="R3"
                                    value={formData.code ?? ''}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                    helperText={t('forms.itemForm.locationCodeHelp')}
                                    slotProps={{ htmlInput: { maxLength: 32 } }}
                                    sx={{ minWidth: { sm: 180 } }}
                                />
                            </Stack>
                            <TextField
                                label={t('common.description')}
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                multiline
                                rows={3}
                                fullWidth
                            />
                            <Divider />
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <MapIcon color="primary" />
                                <Typography variant="h6">{t('pages.storageLocations.openStreetMapAndMapOverlay')}</Typography>
                            </Stack>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                <TextField
                                    label={t('pages.storageLocations.latitude')}
                                    type="number"
                                    value={formData.latitude ?? ''}
                                    onChange={(event) => setFormData((current) => ({ ...current, latitude: Number(event.target.value) }))}
                                    slotProps={{ htmlInput: { step: 0.000001 } }}
                                    fullWidth
                                />
                                <TextField
                                    label={t('pages.storageLocations.longitude')}
                                    type="number"
                                    value={formData.longitude ?? ''}
                                    onChange={(event) => setFormData((current) => ({ ...current, longitude: Number(event.target.value) }))}
                                    slotProps={{ htmlInput: { step: 0.000001 } }}
                                    fullWidth
                                />
                            </Stack>
                            <Button title={translate('pages.storageLocations.chooseAnImageFileForTheMapOverlay')} component="label" variant="outlined">
                                {t('pages.storageLocations.uploadCustomMapOverlay')}
                                <input hidden type="file" accept="image/*" onChange={(event) => setFormData((current) => ({ ...current, mapOverlayFile: event.target.files?.[0], removeMapOverlay: false }))} />
                            </Button>
                            {editingLoc?.mapOverlay && !formData.removeMapOverlay && (
                                <Button title={translate('pages.storageLocations.removeTheSavedMapOverlay')} color="error" onClick={() => setFormData((current) => ({ ...current, removeMapOverlay: true, mapOverlayFile: undefined }))}>
                                    {t('pages.storageLocations.removeExistingMapOverlay')}
                                </Button>
                            )}
                            <StorageLocationMap
                                editable
                                latitude={formData.latitude}
                                longitude={formData.longitude}
                                zoom={formData.mapZoom}
                                overlayBounds={formData.overlayBounds}
                                overlayUrl={overlayPreview || (!formData.removeMapOverlay ? apiFileUrl(editingLoc?.mapOverlay) : undefined)}
                                onCenterChange={(latitude, longitude) => setFormData((current) => ({ ...current, latitude, longitude }))}
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button title={translate('common.discardChangesAndClose')} onClick={() => setDialogOpen(false)} color="inherit">
                            {t('common.cancel')}
                        </Button>
                        <Button title={translate('pages.storageLocations.saveThisStorageLocationSDetailsAndMapOverlay')}
                            type="submit"
                            variant="contained"
                            disabled={createMutation.isPending || updateMutation.isPending || !formData.name}
                        >
                            {t('common.save')}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={deleteConfirmOpen}
                title={t('pages.storageLocations.deactivateStorageLocation')}
                onClose={() => setDeleteConfirmOpen(false)}
                onConfirm={handleDeleteConfirm}
                pending={deleteMutation.isPending}
                actionLabel={t('pages.storageLocations.deactivate')}
                actionTooltip={t('pages.storageLocations.deactivate')}
                actionColor="error"
                message={t('pages.storageLocations.deactivateThisLocationStockAndHistoricalLinksAreRetained')}
            />
        </Box>
    );
}
