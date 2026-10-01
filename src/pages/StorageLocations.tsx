import { AccordionSummary, Button, ListItemButton, IconButton, Tab } from '../components/shared/ActionButtons';
import { Tabs } from '@mui/material';
import { StorageResponsibilities } from '../components/operations/StorageResponsibilities';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { WarehousesPanel } from '../components/operations/WarehousesPanel';
import { getWarehouses } from '../services/warehouseService';
import { locationPath, isDescendant } from '../utils/locationHierarchy';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog } from '../utils/access';
import { StockPositions } from '../components/operations/StockOperations';
import { useOperationList } from '../hooks/useOperations';
import { operationsApi } from '../services/operationsService';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import { Accordion, AccordionDetails, Alert, MenuItem, Checkbox, FormControlLabel, Box, Typography, Paper, List, ListItemText, Grid, TextField, DialogTitle, DialogContent, DialogActions, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Stack, Divider, Card, CardContent, useTheme, useMediaQuery } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RoomIcon from '@mui/icons-material/Room';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MapIcon from '@mui/icons-material/Map';
import { useNavigate } from 'react-router-dom';
import { useStorageLocations, useCreateStorageLocation, useUpdateStorageLocation, useDeleteStorageLocation } from '../hooks/useStorageLocations';
import { useItems } from '../hooks/useItems';
import { useUIStore } from '../store/uiStore';
import type { StorageLocation } from '../types';
import { formatStatus } from '../utils/formatters';
import { translate, useLocalizedText } from '../utils/naming';
import type { StorageLocationFormData } from '../types';
import { StorageLocationMap } from '../components/maps/StorageLocationMap';
import { apiFileUrl } from '../services/apiClient';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { ListPagination } from '../components/shared/ListPagination';
import { useClientPagination } from '../hooks/useClientPagination';

export function StorageLocations() {
    const t = useLocalizedText();
    const { user } = useAuth();
    const canEdit = canEditCatalog(user);
    const navigate = useNavigate();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const { data: locations, isLoading: locationsLoading, error: locationsError, refetch: refetchLocations } = useStorageLocations({ includeInactive: true });
    const { data: items, isLoading: itemsLoading } = useItems();

    const createMutation = useCreateStorageLocation();
    const updateMutation = useUpdateStorageLocation();
    const deleteMutation = useDeleteStorageLocation();

    const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingLoc, setEditingLoc] = useState<StorageLocation | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [warehouseFilter, setWarehouseFilter] = useState('');
    const [parentFilter, setParentFilter] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const [warehousesOpen, setWarehousesOpen] = useState(false);
    const [tab, setTab] = useState('locations');
    const warehouses = useOperationList('warehouses', getWarehouses);

    const [formData, setFormData] = useState<StorageLocationFormData>({
        name: '',
        area: '',
        description: '',
        location: '',
        position: '',
        latitude: 52.375953,
        longitude: 11.826278,
        mapZoom: 19,
    });
    const overlayPreview = useObjectUrl(dialogOpen ? formData.mapOverlayFile : undefined);

    const activeLocation = locations?.find((l) => l.id === selectedLocId) || null;

    const filteredLocations = (() => {
        if (!locations) return [];

        const lower = searchQuery.toLowerCase();
        return locations.filter(
            (l) =>
                (showInactive || l.active) && (!warehouseFilter || l.warehouseId === warehouseFilter)
                && (!parentFilter || isDescendant(l, parentFilter, locations))
                && (locationPath(l, locations).toLowerCase().includes(lower) || (l.area ?? '').toLowerCase().includes(lower))
        );
    })();
    const { pageItems: pageLocations, page: currentLocationPage, setPage: setLocationPage, pageSize: locationPageSize, onPageSizeChange: onLocationPageSizeChange } = useClientPagination(filteredLocations);

    const positions = useOperationList(`storage-positions:${selectedLocId}`, operationsApi.positions({ locationId: selectedLocId ?? undefined }), Boolean(selectedLocId));

    const locatedAssets = useOperationList(`storage-assets:${selectedLocId}`, operationsApi.assets({ locationId: selectedLocId ?? undefined }), Boolean(selectedLocId));

    // Items stored in the selected location
    const storedItems = (() => {
        if (!items || !selectedLocId) return [];
        return items.filter((item) => item.trackingMode === 'serialized' ? locatedAssets.data?.some((asset) => asset.itemId === item.id) : positions.data?.some((position) => position.itemId === item.id && position.quantityOnHand > 0));
    })();

    // Enriched items with checkouts and damage calculations
    const enrichedStoredItems = storedItems.map((item) => {
        const rows = positions.data?.filter((position) => position.itemId === item.id) ?? [];
        const assets = locatedAssets.data?.filter((asset) => asset.itemId === item.id && !['in_field', 'in_custody', 'lost', 'written_off', 'in_transit'].includes(asset.availabilityStatus)) ?? [];
        const { totalStock, remaining, checkedOut } = item.trackingMode === 'serialized' ? { totalStock: assets.length, remaining: assets.filter((asset) => asset.availabilityStatus === 'available' && !['damaged', 'unsafe', 'lost'].includes(asset.conditionStatus)).length, checkedOut: 0 } : { totalStock: rows.reduce((sum, row) => sum + row.quantityOnHand, 0), remaining: rows.reduce((sum, row) => sum + row.availableQuantity, 0), checkedOut: 0 };
        return { item, totalStock, remaining, checkedOut };
    });
    const { pageItems: pageStoredItems, page: currentItemPage, setPage: setItemPage, pageSize: itemPageSize, onPageSizeChange: onItemPageSizeChange } = useClientPagination(enrichedStoredItems);

    function handleOpenCreate() {
        setEditingLoc(null);
        setFormData({ warehouseId: null, parentLocationId: null, locationType: 'bin', active: true, name: '', area: '', description: '', location: '', position: '', latitude: 52.375953, longitude: 11.826278, mapZoom: 19 });
        setDialogOpen(true);
    }

    function handleOpenEdit(loc: StorageLocation, e?: React.MouseEvent) {
        e?.stopPropagation();
        setEditingLoc(loc);
        setFormData({
            warehouseId: loc.warehouseId ?? null, parentLocationId: loc.parentLocationId ?? null, locationType: loc.locationType, active: loc.active,
            name: loc.name,
            mapOverlay: loc.mapOverlay ?? null,
            area: loc.area || '',
            description: loc.description || '',
            location: loc.location || '',
            position: loc.position || '',
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

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.name) return;

        if (editingLoc) {
            updateMutation.mutate(
                { id: editingLoc.id, data: formData },
                {
                    onSuccess: () => {
                        setDialogOpen(false);
                        showSnackbar(t('Lagerort erfolgreich aktualisiert', 'Storage location updated successfully'), 'success');
                    },
                    onError: (error) => showSnackbar(error.message, 'error'),
                }
            );
        } else {
            createMutation.mutate(formData, {
                onSuccess: (newLoc) => {
                    setDialogOpen(false);
                    setSelectedLocId(newLoc.id);
                    showSnackbar(t('Lagerort erfolgreich erstellt', 'Storage location created successfully'), 'success');
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
                showSnackbar(t('Lagerort deaktiviert', 'Storage location deactivated'), 'success');
            },
            onError: (error) => showSnackbar(error.message, 'error'),
        });
    }

    return (
        <Box>
            {locationsError && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={() => { void refetchLocations(); }}>{t('Erneut laden', 'Retry')}</Button>}>{locationsError.message}</Alert>}
            <Button title={translate('Standorte anlegen und bearbeiten', 'Create and edit warehouses')} disabled={!canEdit} onClick={() => setWarehousesOpen(true)}>{t('Standorte verwalten', 'Manage warehouses')}</Button>
            <Dialog open={warehousesOpen} onClose={() => setWarehousesOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t('Standorte', 'Warehouses')}</DialogTitle><DialogContent><WarehousesPanel /></DialogContent><DialogActions><Button title={translate('Diesen Dialog schließen', 'Close this dialog')} onClick={() => setWarehousesOpen(false)}>{t('Schließen', 'Close')}</Button></DialogActions></Dialog>
            {(tab !== 'locations' || !isMobile || !selectedLocId) && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {t('Lagerorte', 'Storage locations')}
                    </Typography>
                    <Button title={translate('Einen neuen Lagerort anlegen', 'Create a new storage location')}
                        variant="contained"
                        startIcon={<AddIcon />}
                        disabled={!canEdit} onClick={handleOpenCreate}
                    >
                        {t('Lagerort hinzufügen', 'Add storage location')}
                    </Button>
                </Box>
            )}

            <Tabs value={tab} onChange={(_, value: string) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 2 }} aria-label={t('Lagerort-Bereiche', 'Storage location sections')}>
                <Tab value="locations" label={t('Lagerorte & Bestand', 'Locations & stock')} id="storage-tab-locations" aria-controls="storage-panel-locations" />
                {canEdit && <Tab value="responsibilities" label={t('Verantwortung & fehlende Angaben', 'Responsibility & missing information')} id="storage-tab-responsibilities" aria-controls="storage-panel-responsibilities" />}
            </Tabs>
            {tab === 'responsibilities' && canEdit && !locationsError && <Box role="tabpanel" id="storage-panel-responsibilities" aria-labelledby="storage-tab-responsibilities">
                <StorageResponsibilities locations={locations ?? []} loading={locationsLoading} onEditLocation={handleOpenEdit} />
            </Box>}
            <Box hidden={tab !== 'locations'} role="tabpanel" id="storage-panel-locations" aria-labelledby="storage-tab-locations">
            {isMobile && selectedLocId && (
                <Button title={translate('Zur Lagerortübersicht zurückkehren', 'Return to the storage location list')}
                    startIcon={<ArrowBackIcon />}
                    onClick={() => setSelectedLocId(null)}
                    sx={{ mb: 2 }}
                >
                    {t('Zurück zur Lagerort-Liste', 'Back to location list')}
                </Button>
            )}

            <Grid container spacing={3}>
                {/* Left Column: Locations List */}
                {(!isMobile || !selectedLocId) && (
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : 'calc(100vh - 180px)', overflow: isMobile ? 'visible' : 'hidden' }}>
                            <TextField
                                label={t('Lagerorte suchen', 'Search storage locations')}
                                value={searchQuery}
                                onChange={(e) => { setSearchQuery(e.target.value); setLocationPage(1); }}
                                size="small"
                                fullWidth
                                sx={{ mb: 2 }}
                            />

                            <Stack spacing={1} sx={{ mb: 2 }}>
                              <TextField select size="small" label={t('Standort', 'Warehouse')} value={warehouseFilter} onChange={(e) => { setWarehouseFilter(e.target.value); setParentFilter(''); setLocationPage(1); }}><MenuItem value="">{t('Alle', 'All')}</MenuItem>{warehouses.data?.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}</TextField>
                              <TextField select size="small" label={t('Teilbaum', 'Location subtree')} value={parentFilter} onChange={(e) => { setParentFilter(e.target.value); setLocationPage(1); }}><MenuItem value="">{t('Alle', 'All')}</MenuItem>{locations?.filter((l) => !warehouseFilter || l.warehouseId === warehouseFilter).map((l) => <MenuItem key={l.id} value={l.id}>{locationPath(l, locations)}</MenuItem>)}</TextField>
                              <FormControlLabel label={t('Inaktive anzeigen', 'Show inactive')} control={<Checkbox checked={showInactive} onChange={(e) => { setShowInactive(e.target.checked); setLocationPage(1); }} />} />
                            </Stack>
                            {locationsLoading ? (
                                <Typography sx={{ p: 2 }}>{t('Lagerorte werden geladen...', 'Loading storage locations...')}</Typography>
                            ) : filteredLocations.length === 0 ? (
                                <Typography sx={{ p: 2 }} color="text.secondary">
                                    {t('Keine Lagerorte gefunden', 'No storage locations found')}
                                </Typography>
                            ) : (
                                <List sx={{ overflowY: isMobile ? 'visible' : 'auto', flexGrow: 1, px: 0 }}>
                                    {pageLocations.map((loc) => {
                                        return (
                                            <ListItemButton title={translate('Details und Bestand dieses Lagerorts anzeigen', 'Display this storage location\'s details and stock')}
                                                key={loc.id}
                                                selected={selectedLocId === loc.id}
                                                onClick={() => { setSelectedLocId(loc.id); setItemPage(1); }}
                                                sx={{
                                                    borderRadius: 2,
                                                    mb: 1,
                                                    border: '1px solid transparent',
                                                    borderColor: selectedLocId === loc.id ? 'primary.main' : 'rgba(255, 255, 255, 0.04)',
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
                                                        <Typography variant="body2" color="text.secondary" noWrap>
                                                            {locationPath(loc, locations ?? [])}
                                                        </Typography>
                                                    }
                                                />
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                                    <Chip
                                                        label={loc.active ? loc.locationType : t('Inaktiv', 'Inactive')}
                                                        size="small"
                                                        variant="outlined"
                                                    />

                                                    <IconButton title={t('Bearbeiten', 'Edit')} size="small" disabled={!canEdit} onClick={(e) => handleOpenEdit(loc, e)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>

                                                    <IconButton title={t('Deaktivieren', 'Deactivate')} size="small" color="error" disabled={!canEdit} onClick={(e) => handleOpenDelete(loc.id, e)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Box>
                                            </ListItemButton>
                                        );
                                    })}
                                </List>
                            )}
                            <ListPagination count={filteredLocations.length} page={currentLocationPage} onChange={setLocationPage} pageSize={locationPageSize} onPageSizeChange={onLocationPageSizeChange} />
                        </Paper>
                    </Grid>
                )}

                {/* Right Column: Location Details & Stored Items */}
                {(!isMobile || Boolean(selectedLocId)) && (
                    <Grid size={{ xs: 12, md: 8 }}>
                        {activeLocation ? (
                            <Paper sx={{ p: { xs: 2, md: 3 }, height: isMobile ? 'auto' : 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', overflow: isMobile ? 'visible' : 'hidden' }}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <RoomIcon color="primary" sx={{ fontSize: 32 }} />
                                        <Box>
                                            <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                                {locationPath(activeLocation, locations ?? [])}
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
                                                {activeLocation.area && (
                                                    <Typography variant="subtitle2" color="text.secondary">
                                                        Bereich/Sektion: {activeLocation.area}
                                                    </Typography>
                                                )}
                                                {activeLocation.location && (
                                                    <Typography variant="subtitle2" color="text.secondary">
                                                        Ort: {activeLocation.location}
                                                    </Typography>
                                                )}
                                                {activeLocation.position && (
                                                    <Typography variant="subtitle2" color="text.secondary">
                                                        Position: {activeLocation.position}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                    </Box>
                                    <Button title={translate('Die Daten dieses Lagerorts bearbeiten', 'Edit this storage location\'s details')}
                                        size="small"
                                        variant="outlined"
                                        startIcon={<EditIcon />}
                                        disabled={!canEdit} onClick={(e) => handleOpenEdit(activeLocation, e)}
                                    >
                                        {t('Bearbeiten', 'Edit')}
                                    </Button>
                                </Box>

                                <Accordion key={activeLocation.id}><AccordionSummary title={translate('Chargen, Geräte und Bestandszustände ein- oder ausblenden', 'Show or hide lots, assets and stock conditions')}>{t('Chargen, Geräte und Bestandszustände', 'Lots, assets and stock conditions')}</AccordionSummary><AccordionDetails><Button title={translate('Etiketten, Scans und Umlagerungen für diesen Lagerort öffnen', 'Open labels, scanning and transfers for this location')} onClick={() => navigate(`/locations/${activeLocation.id}`)}>{t('Etiketten / Scannen / Umlagern', 'Labels / scan / transfer')}</Button><StockPositions locationId={activeLocation.id} /></AccordionDetails></Accordion>
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

                                <Divider sx={{ my: 2 }} />

                                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                                    {t('Hier gelagerte Artikel', 'Items stored here')} ({enrichedStoredItems.length})
                                </Typography>

                                {itemsLoading ? (
                                    <Typography sx={{ p: 2 }}>{t('Artikel werden geladen...', 'Loading items...')}</Typography>
                                ) : enrichedStoredItems.length === 0 ? (
                                    <Box sx={{ p: 4, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                        <Typography color="text.secondary">{t('In diesem Lagerort sind noch keine Artikel gelagert.', 'No items are stored at this location yet.')}</Typography>
                                    </Box>
                                ) : isMobile ? (
                                    <Stack spacing={0.5}>
                                        {pageStoredItems.map(({ item, remaining }) => (
                                            <Card
                                                key={item.id}
                                                variant="outlined"
                                                onClick={() => navigate(`/items/${item.id}`)}
                                                sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
                                            >
                                                <CardContent sx={{ px: 1.5, py: 1, '&:last-child': { pb: 1 } }}>
                                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                        <Typography noWrap sx={{ minWidth: 0, flexGrow: 1, fontWeight: 700 }}>
                                                            {item.name}
                                                        </Typography>
                                                        <Typography sx={{ flexShrink: 0, color: remaining > 0 ? 'success.main' : 'error.main', fontWeight: 800 }}>
                                                            {remaining}
                                                        </Typography>
                                                        <ArrowForwardIosIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                                                    </Box>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </Stack>
                                ) : (
                                    <TableContainer sx={{ flexGrow: 1, overflowY: 'auto' }}>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>{t('Artikelname', 'Item name')}</TableCell>
                                                    <TableCell>{t('Kategorie', 'Category')}</TableCell>
                                                    <TableCell align="right">{t('Verfügbarer Bestand', 'Available stock')}</TableCell>
                                                    <TableCell>{t('Status', 'Status')}</TableCell>
                                                    <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {pageStoredItems.map(({ item, totalStock, remaining, checkedOut }) => (
                                                    <TableRow
                                                        key={item.id}
                                                        hover
                                                        onClick={() => navigate(`/items/${item.id}`)}
                                                        sx={{ cursor: 'pointer' }}
                                                    >
                                                        <TableCell sx={{ fontWeight: 600 }}>{item.name}</TableCell>
                                                        <TableCell>{item.category || '—'}</TableCell>
                                                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                {remaining}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                {totalStock} gesamt {checkedOut > 0 && `(${checkedOut} ausgeliehen)`}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                label={formatStatus(item.status)}
                                                                color={
                                                                    item.status === 'available'
                                                                        ? 'success'
                                                                        : item.status === 'checked_out'
                                                                            ? 'warning'
                                                                            : item.status === 'damaged'
                                                                                ? 'error'
                                                                                : 'default'
                                                                }
                                                                size="small"
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <IconButton title={translate('Die Details dieses Artikels öffnen', 'Open this item\'s details')} size="small" color="primary">
                                                                <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
                                                            </IconButton>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                                <ListPagination count={enrichedStoredItems.length} page={currentItemPage} onChange={setItemPage} pageSize={itemPageSize} onPageSizeChange={onItemPageSizeChange} />
                            </Paper>
                        ) : (
                            <Paper
                                sx={{
                                    p: 3,
                                    height: 'calc(100vh - 180px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: 'rgba(255, 255, 255, 0.01)',
                                }}
                            >
                                <Box sx={{ textAlign: 'center' }}>
                                    <RoomIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                                    <Typography color="text.secondary" variant="subtitle1">
                                        {t('Wählen Sie einen Lagerort aus der Liste aus, um die gelagerten Artikel anzuzeigen', 'Select a storage location from the list to view its items')}
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
                <DialogTitle>{editingLoc ? t('Lagerort bearbeiten', 'Edit storage location') : t('Neuer Lagerort', 'New storage location')}</DialogTitle>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogContent sx={{ pt: 1 }}>
                        <Stack spacing={2}>
                            <TextField select label={t('Standort', 'Warehouse')} value={formData.warehouseId ?? ''} onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value || null, parentLocationId: null })}><MenuItem value="">{t('Nicht zugeordnet', 'Unassigned')}</MenuItem>{warehouses.data?.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}{w.active ? '' : ` (${t('inaktiv', 'inactive')})`}</MenuItem>)}</TextField>
                            <TextField select label={t('Übergeordneter Lagerort', 'Parent location')} value={formData.parentLocationId ?? ''} onChange={(e) => setFormData({ ...formData, parentLocationId: e.target.value || null })}><MenuItem value="">{t('Oberste Ebene', 'Top level')}</MenuItem>{locations?.filter((l) => (l.warehouseId ?? null) === (formData.warehouseId ?? null) && (!editingLoc || !isDescendant(l, editingLoc.id, locations))).map((l) => <MenuItem key={l.id} value={l.id}>{locationPath(l, locations)}</MenuItem>)}</TextField>
                            <TextField select label={t('Lagerorttyp', 'Location type')} value={formData.locationType ?? 'bin'} onChange={(e) => setFormData({ ...formData, locationType: e.target.value as StorageLocation['locationType'] })}>{['warehouse', 'bin', 'staging', 'event_site', 'vehicle', 'in_custody', 'quarantine', 'repair', 'scrap'].map((type) => <MenuItem key={type} value={type}>{type.replaceAll('_', ' ')}</MenuItem>)}</TextField>
                            <FormControlLabel label={t('Aktiv', 'Active')} control={<Checkbox checked={formData.active ?? true} onChange={(e) => setFormData({ ...formData, active: e.target.checked })} />} />
                            <Alert severity="info">{t('Inaktive Lagerorte bleiben für Bestand und Historie sichtbar. Unterorte müssen zuerst deaktiviert werden.', 'Inactive locations remain visible for stock and history. Deactivate child locations first.')}</Alert>
                            <TextField
                                label={t('Name des Lagerorts', 'Storage location name')}
                                value={formData.name}
                                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                                required
                                fullWidth
                                autoFocus
                            />
                            <TextField
                                        label={t('Bereich / Sektion', 'Area / section')}
                                        placeholder={t('z. B. Regal A, Raum 204', 'e.g. shelf A, room 204')}
                                        value={formData.area}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, area: e.target.value }))}
                                        fullWidth
                                    />
                                    <TextField
                                        label={t('Ort / Gebäude', 'Location / building')}
                                        placeholder={t('z. B. Gebäude B, Raum 204', 'e.g. building B, room 204')}
                                        value={formData.location}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                                        fullWidth
                                    />
                                    <TextField
                                        label={t('Position / Regal', 'Position / shelf')}
                                        placeholder={t('z. B. Reihe 3, Fach 2', 'e.g. row 3, compartment 2')}
                                        value={formData.position}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
                                        fullWidth
                                    />
                            <TextField
                                label={t('Beschreibung', 'Description')}
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                multiline
                                rows={3}
                                fullWidth
                            />
                            <Divider />
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <MapIcon color="primary" />
                                <Typography variant="h6">{t('OpenStreetMap und Kartenebene', 'OpenStreetMap and map overlay')}</Typography>
                            </Stack>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                                <TextField
                                    label={t('Breitengrad', 'Latitude')}
                                    type="number"
                                    value={formData.latitude ?? ''}
                                    onChange={(event) => setFormData((current) => ({ ...current, latitude: Number(event.target.value) }))}
                                    slotProps={{ htmlInput: { step: 0.000001 } }}
                                    fullWidth
                                />
                                <TextField
                                    label={t('Längengrad', 'Longitude')}
                                    type="number"
                                    value={formData.longitude ?? ''}
                                    onChange={(event) => setFormData((current) => ({ ...current, longitude: Number(event.target.value) }))}
                                    slotProps={{ htmlInput: { step: 0.000001 } }}
                                    fullWidth
                                />
                            </Stack>
                            <Button title={translate('Eine Bilddatei als Kartenebene auswählen', 'Choose an image file for the map overlay')} component="label" variant="outlined">
                                {t('Eigene Kartenebene hochladen', 'Upload custom map overlay')}
                                <input hidden type="file" accept="image/*" onChange={(event) => setFormData((current) => ({ ...current, mapOverlayFile: event.target.files?.[0], removeMapOverlay: false }))} />
                            </Button>
                            {editingLoc?.mapOverlay && !formData.removeMapOverlay && (
                                <Button title={translate('Die gespeicherte Kartenebene entfernen', 'Remove the saved map overlay')} color="error" onClick={() => setFormData((current) => ({ ...current, removeMapOverlay: true, mapOverlayFile: undefined }))}>
                                    {t('Vorhandene Kartenebene entfernen', 'Remove existing map overlay')}
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
                        <Button title={translate('Änderungen verwerfen und schließen', 'Discard changes and close')} onClick={() => setDialogOpen(false)} color="inherit">
                            {t('Abbrechen', 'Cancel')}
                        </Button>
                        <Button title={translate('Die Daten und Kartenebene dieses Lagerorts speichern', 'Save this storage location\'s details and map overlay')}
                            type="submit"
                            variant="contained"
                            disabled={createMutation.isPending || updateMutation.isPending || !formData.name}
                        >
                            {t('Speichern', 'Save')}
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={deleteConfirmOpen}
                title={t('Lagerort deaktivieren', 'Deactivate storage location')}
                onClose={() => setDeleteConfirmOpen(false)}
                onConfirm={handleDeleteConfirm}
                pending={deleteMutation.isPending}
                actionLabel={t('Deaktivieren', 'Deactivate')}
                actionTooltip={t('Deaktivieren', 'Deactivate')}
                actionColor="error"
                message={t(
                    'Lagerort deaktivieren? Bestand und historische Verknüpfungen bleiben erhalten.',
                    'Deactivate this location? Stock and historical links are retained.',
                )}
            />
        </Box>
    );
}
