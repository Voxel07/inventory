import { InventorySharing } from '../components/items/InventorySharing';
import { Button, Tab } from '../components/shared/ActionButtons';
import { ActionBar } from '../components/shared/ActionBar';
import { Tabs } from '@mui/material';
import { StorageResponsibilities } from '../components/operations/StorageResponsibilities';
import { StorageLocationList } from '../components/storage/StorageLocationList';
import { StorageStructureDialog } from '../components/storage/StorageStructureDialog';
import { StorageLocationEditDialog } from '../components/storage/StorageLocationEditDialog';
import { holdsStock, locationPath, locationRole } from '../utils/locationHierarchy';
import { useAuth } from '../hooks/useAuth';
import { canCreateInventory, canEditCatalog } from '../utils/access';
import { ItemsList } from '../components/lists/ItemsList';
import { getLocationInventory } from '../utils/locationStock';
import { operationsApi } from '../services/operationsService';
import { useState } from 'react';
import { Alert, Box, Typography, Paper, Grid, Chip, Stack, Divider, useTheme, useMediaQuery } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PrintIcon from '@mui/icons-material/Print';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import RoomIcon from '@mui/icons-material/Room';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStorageLocations, useDeleteStorageLocation } from '../hooks/useStorageLocations';
import { useItemsByIds } from '../hooks/useItems';
import { useCompleteList } from '../hooks/usePagedList';
import { queryKeys } from '../utils/queryKeys';
import { useUIStore } from '../store/uiStore';
import type { StorageLocation } from '../types';
import { translate, useT } from '../utils/naming';
import { StorageLocationMap } from '../components/maps/StorageLocationMap';
import { apiFileUrl } from '../services/apiClient';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';

/** What the structure dialog opens on: a top-level location (or a new one) and the node to expand. */
interface StructureTarget { rootId?: string; focusId?: string }

export function StorageLocations() {
    const t = useT();
    const { user } = useAuth();
    const canEdit = canEditCatalog(user);
    const canCreate = canCreateInventory(user);
    const navigate = useNavigate();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
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
    const [structureTarget, setStructureTarget] = useState<StructureTarget | null>(null);
    const [editingLoc, setEditingLoc] = useState<StorageLocation | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [tab, setTab] = useState('locations');

    // The whole tree: grouped list, structure editor, parent choices and the detail panel's children.
    const hierarchy = useStorageLocations({ includeInactive: true });
    const allLocations = hierarchy.data ?? [];
    const activeLocation = allLocations.find((l) => l.id === selectedLocId) ?? null;
    const canEditLocation = (location: StorageLocation) => (location.access?.privateResource ? Boolean(location.access.canEdit) : canEdit);

    // One location's stock is bounded: read all of it, then exactly the items stored there.
    const stocked = Boolean(activeLocation && holdsStock(activeLocation));
    const positions = useCompleteList(queryKeys.operations(`storage-positions:${selectedLocId}`), operationsApi.positions({ locationId: selectedLocId ?? undefined }), { enabled: stocked });
    const locatedAssets = useCompleteList(queryKeys.operations(`storage-assets:${selectedLocId}`), operationsApi.assets({ locationId: selectedLocId ?? undefined }), { enabled: stocked });
    const itemQuery = useItemsByIds([...(positions.data ?? []).map((position) => position.itemId), ...(locatedAssets.data ?? []).map((asset) => asset.itemId)]);

    const inventory = getLocationInventory(itemQuery.data ?? [], positions.data ?? [], locatedAssets.data ?? [], selectedLocId);
    const inventoryLoading = itemQuery.isLoading || positions.isLoading || locatedAssets.isLoading;
    const inventoryError = itemQuery.error || positions.error || locatedAssets.error;
    function retryInventory() {
        void itemQuery.refetch();
        void positions.refetch();
        void locatedAssets.refetch();
    }

    const children = allLocations.filter((location) => location.parentLocationId === selectedLocId)
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

    function handleDeleteConfirm() {
        if (!selectedLocId) return;
        deleteMutation.mutate(selectedLocId, {
            onSuccess: () => {
                setDeleteConfirmOpen(false);
                showSnackbar(t('pages.storageLocations.storageLocationDeactivated'), 'success');
            },
            onError: (error) => showSnackbar(error.message, 'error'),
        });
    }

    const role = activeLocation ? locationRole(activeLocation) : null;

    return (
        <Box>
            {hierarchy.error && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => { void hierarchy.refetch(); }}>{t('common.retry')}</Button>}>{hierarchy.error.message}</Alert>}
            {(tab !== 'locations' || !isMobile || !selectedLocId) && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="h4">
                        {t('nav.storageLocations')}
                    </Typography>
                    {canCreate && <Button title={translate('pages.storageLocations.createANewStorageLocation')}
                        variant="contained"
                        startIcon={<AddIcon />}
                        disabled={hierarchy.isLoading}
                        onClick={() => setStructureTarget({})}
                    >
                        {t('pages.storageLocations.newStorageLocation')}
                    </Button>}
                </Box>
            )}

            {canEdit && <Tabs value={tab} onChange={(_, value: string) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2, minWidth: 0, maxWidth: '100%' }} aria-label={t('pages.storageLocations.storageLocationSections')}>
                <Tab value="locations" label={t('pages.storageLocations.locationsStock')} id="storage-tab-locations" aria-controls="storage-panel-locations" />
                <Tab value="responsibilities" label={t('pages.storageLocations.responsibilityMissingInformation')} id="storage-tab-responsibilities" aria-controls="storage-panel-responsibilities" />
            </Tabs>}
            {tab === 'responsibilities' && canEdit && <Box role="tabpanel" id="storage-panel-responsibilities" aria-labelledby="storage-tab-responsibilities">
                <StorageResponsibilities locations={allLocations} loading={hierarchy.isLoading} onEditLocation={setEditingLoc} />
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
                {(!isMobile || !selectedLocId) && (
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : 'calc(100vh - 180px)', overflowY: isMobile ? 'visible' : 'auto' }}>
                            <StorageLocationList locations={allLocations} loading={hierarchy.isLoading} selectedId={selectedLocId} onSelect={setSelectedLocId} />
                        </Paper>
                    </Grid>
                )}

                {(!isMobile || Boolean(selectedLocId)) && (
                    <Grid size={{ xs: 12, md: 8 }}>
                        {activeLocation && <InventorySharing kind="storage-locations" id={activeLocation.id} access={activeLocation.access} />}
                        {activeLocation && role ? (
                            <Paper sx={{ p: { xs: 2, md: 3 }, height: isMobile ? 'auto' : 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', overflowY: isMobile ? 'visible' : 'auto' }}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                                        <RoomIcon color="primary" sx={{ fontSize: 32 }} />
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography variant="h5" sx={{ wordBreak: 'break-word' }}>
                                                {locationPath(activeLocation, allLocations)}
                                            </Typography>
                                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                                <Typography variant="subtitle2" color="text.secondary" className="mono">{activeLocation.fullCode}</Typography>
                                                <Chip size="small" variant="outlined" label={t(`pages.storageLocations.role.${role}`)} />
                                                {!activeLocation.active && <Chip size="small" label={t('common.inactive')} />}
                                            </Stack>
                                        </Box>
                                    </Box>
                                    <ActionBar size="small" sx={{ flex: '1 0 auto' }} actions={[
                                        canCreate && activeLocation.active && { key: 'structure',
                                            label: role === 'location' ? t('pages.storageLocations.editStructure') : t('pages.storageLocations.addStoragePlaces'),
                                            title: role === 'location' ? t('pages.storageLocations.addOrRenameSectionsAndStoragePlaces') : t('pages.storageLocations.addStoragePlacesInsideThisOne'),
                                            icon: role === 'location' ? <AccountTreeIcon /> : <AddIcon />,
                                            onClick: () => setStructureTarget({ rootId: activeLocation.rootLocationId ?? activeLocation.id, focusId: activeLocation.id }) },
                                        { key: 'print', label: t('pages.storageLocations.printLabels'), title: t('pages.storageLocations.printQrLabelsForAllPlacesHere'),
                                            icon: <PrintIcon />, variant: 'text', onClick: () => navigate(`/storage-locations/${activeLocation.id}/labels`) },
                                        role !== 'location' && { key: 'labels', label: t('pages.storageLocations.labelsScanTransfer'), title: t('pages.storageLocations.openLabelsScanningAndTransfersForThisLocation'),
                                            icon: <QrCode2Icon />, variant: 'text', onClick: () => navigate(`/locations/${activeLocation.id}`) },
                                        { key: 'edit', label: t('common.edit'), title: translate('pages.storageLocations.editThisStorageLocationSDetails'), icon: <EditIcon />, pinned: true,
                                            disabled: !canEditLocation(activeLocation), onClick: () => setEditingLoc(activeLocation) },
                                        activeLocation.active && { key: 'deactivate', label: t('pages.storageLocations.deactivate'), title: t('pages.storageLocations.deactivate'), icon: <DeleteIcon />,
                                            variant: 'text', disabled: !canEditLocation(activeLocation), onClick: () => setDeleteConfirmOpen(true) },
                                    ]} />
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

                                <Box sx={{ mb: 1 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                                        {role === 'location' ? t('pages.storageLocations.sections') : t('pages.storageLocations.storagePlaces')} ({children.length})
                                    </Typography>
                                    {children.length === 0
                                        ? <Typography variant="body2" color="text.secondary">{role === 'location' ? t('pages.storageLocations.noSectionsYet') : t('pages.storageLocations.noStoragePlacesYet')}</Typography>
                                        : <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                            {children.map((child) => <Chip key={child.id} clickable variant={child.active ? 'outlined' : 'filled'} onClick={() => setSelectedLocId(child.id)}
                                                label={<><Box component="span" className="mono" sx={{ mr: 0.75 }}>{child.code}</Box>{child.name}</>} />)}
                                        </Stack>}
                                </Box>

                                <Divider sx={{ my: 2 }} />

                                {role === 'location' ? <Alert severity="info">{t('pages.storageLocations.locationsHoldNoStock')}</Alert> : <>
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
                                        isLoading={inventoryLoading} loadingMore={false} />
                                </>}
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

            {structureTarget && <StorageStructureDialog locations={allLocations} rootId={structureTarget.rootId} focusId={structureTarget.focusId}
                canCreatePublic={canEdit} onClose={() => setStructureTarget(null)} onSaved={(rootId) => { if (!structureTarget.focusId) setSelectedLocId(rootId); }} />}
            {editingLoc && <StorageLocationEditDialog location={editingLoc} locations={allLocations} onClose={() => setEditingLoc(null)} />}

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
