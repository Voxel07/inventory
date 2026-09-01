import { useState, useMemo, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    List,
    ListItemButton,
    ListItemText,
    Grid,
    Button,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Stack,
    Divider,
    IconButton,
    Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RoomIcon from '@mui/icons-material/Room';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { useNavigate } from 'react-router-dom';
import { useStorageLocations, useCreateStorageLocation, useUpdateStorageLocation, useDeleteStorageLocation } from '../hooks/useStorageLocations';
import { useItems } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { useUIStore } from '../store/uiStore';
import type { StorageLocation } from '../types';
import { calculateItemStock } from '../utils/stock';
import { formatStatus } from '../utils/formatters';
import { useTranslate } from '../utils/naming';
import type { StorageLocationFormData } from '../types';
import { StorageLocationMap } from '../components/maps/StorageLocationMap';
import pb from '../services/pocketbaseClient';
import MapIcon from '@mui/icons-material/Map';

export function StorageLocations() {
    const t = useTranslate();
    const navigate = useNavigate();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const { data: locations, isLoading: locationsLoading } = useStorageLocations();
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: transactions } = useTransactions();
    const { data: damageReports } = useDamageReports();

    const createMutation = useCreateStorageLocation();
    const updateMutation = useUpdateStorageLocation();
    const deleteMutation = useDeleteStorageLocation();

    const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingLoc, setEditingLoc] = useState<StorageLocation | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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
    const overlayPreview = useMemo(() => formData.mapOverlayFile ? URL.createObjectURL(formData.mapOverlayFile) : undefined, [formData.mapOverlayFile]);
    useEffect(() => () => {
        if (overlayPreview) URL.revokeObjectURL(overlayPreview);
    }, [overlayPreview]);

    const activeLocation = useMemo(() => {
        return locations?.find((l) => l.id === selectedLocId) || null;
    }, [locations, selectedLocId]);

    const filteredLocations = useMemo(() => {
        if (!locations) return [];
        if (!searchQuery.trim()) return locations;
        const lower = searchQuery.toLowerCase();
        return locations.filter(
            (l) =>
                l.name.toLowerCase().includes(lower) ||
                (l.area && l.area.toLowerCase().includes(lower))
        );
    }, [locations, searchQuery]);

    // Items stored in the selected location
    const storedItems = useMemo(() => {
        if (!items || !selectedLocId) return [];
        return items.filter((item) => item.storageLocation === selectedLocId);
    }, [items, selectedLocId]);

    // Enriched items with checkouts and damage calculations
    const enrichedStoredItems = useMemo(() => {
        return storedItems.map((item) => {
            const { totalStock, remaining, checkedOut } = calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0);
            return { item, totalStock, remaining, checkedOut };
        });
    }, [storedItems, transactions, damageReports]);

    function handleOpenCreate() {
        setEditingLoc(null);
        setFormData({ name: '', area: '', description: '', location: '', position: '', latitude: 52.375953, longitude: 11.826278, mapZoom: 19 });
        setDialogOpen(true);
    }

    function handleOpenEdit(loc: StorageLocation, e: React.MouseEvent) {
        e.stopPropagation();
        setEditingLoc(loc);
        setFormData({
            name: loc.name,
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
                    onError: () => showSnackbar(t('Fehler beim Aktualisieren des Lagerorts', 'Could not update storage location'), 'error'),
                }
            );
        } else {
            createMutation.mutate(formData, {
                onSuccess: (newLoc) => {
                    setDialogOpen(false);
                    setSelectedLocId(newLoc.id);
                    showSnackbar(t('Lagerort erfolgreich erstellt', 'Storage location created successfully'), 'success');
                },
                onError: () => showSnackbar(t('Fehler beim Erstellen des Lagerorts', 'Could not create storage location'), 'error'),
            });
        }
    }

    function handleDeleteConfirm() {
        if (!selectedLocId) return;
        deleteMutation.mutate(selectedLocId, {
            onSuccess: () => {
                setDeleteConfirmOpen(false);
                setSelectedLocId(null);
                showSnackbar(t('Lagerort gelöscht', 'Storage location deleted'), 'success');
            },
            onError: () => showSnackbar(t('Fehler beim Löschen des Lagerorts', 'Could not delete storage location'), 'error'),
        });
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {t('Lagerorte', 'Storage locations')}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleOpenCreate}
                >
                    {t('Lagerort hinzufügen', 'Add storage location')}
                </Button>
            </Box>

            <Grid container spacing={3}>
                {/* Left Column: Locations List */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', overflow: 'hidden' }}>
                        <TextField
                            label={t('Lagerorte suchen', 'Search storage locations')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            size="small"
                            fullWidth
                            sx={{ mb: 2 }}
                        />

                        {locationsLoading ? (
                            <Typography sx={{ p: 2 }}>{t('Lagerorte werden geladen...', 'Loading storage locations...')}</Typography>
                        ) : filteredLocations.length === 0 ? (
                            <Typography sx={{ p: 2 }} color="text.secondary">
                                {t('Keine Lagerorte gefunden', 'No storage locations found')}
                            </Typography>
                        ) : (
                            <List sx={{ overflowY: 'auto', flexGrow: 1, px: 0 }}>
                                {filteredLocations.map((loc) => {
                                    const count = items?.filter((i) => i.storageLocation === loc.id).length ?? 0;
                                    return (
                                        <ListItemButton
                                            key={loc.id}
                                            selected={selectedLocId === loc.id}
                                            onClick={() => setSelectedLocId(loc.id)}
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
                                                        {loc.area || t('Kein Bereich angegeben', 'No area specified')}
                                                    </Typography>
                                                }
                                            />
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                                <Chip
                                                    label={count === 1 ? t('1 Artikel', '1 item') : t(`${count} Artikel`, `${count} items`)}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                                <Tooltip title={t('Bearbeiten', 'Edit')} arrow>
                                                    <IconButton size="small" onClick={(e) => handleOpenEdit(loc, e)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title={t('Löschen', 'Delete')} arrow>
                                                    <IconButton size="small" color="error" onClick={(e) => handleOpenDelete(loc.id, e)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </ListItemButton>
                                    );
                                })}
                            </List>
                        )}
                    </Paper>
                </Grid>

                {/* Right Column: Location Details & Stored Items */}
                <Grid size={{ xs: 12, md: 8 }}>
                    {activeLocation ? (
                        <Paper sx={{ p: 3, height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                <RoomIcon color="primary" sx={{ fontSize: 32 }} />
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                                        {activeLocation.name}
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

                            {activeLocation.description && (
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 3, pl: 6 }}>
                                    {activeLocation.description}
                                </Typography>
                            )}

                            {activeLocation.latitude != null && activeLocation.longitude != null && (
                                <Box sx={{ mb: 3 }}>
                                    <StorageLocationMap
                                        latitude={activeLocation.latitude}
                                        longitude={activeLocation.longitude}
                                        zoom={activeLocation.mapZoom}
                                        overlayBounds={activeLocation.overlayBounds}
                                        overlayUrl={activeLocation.mapOverlay ? pb.files.getURL(activeLocation, activeLocation.mapOverlay) : undefined}
                                    />
                                </Box>
                            )}

                            <Divider sx={{ mb: 3 }} />

                            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                                {t('Hier gelagerte Artikel', 'Items stored here')}
                            </Typography>

                            {itemsLoading ? (
                                <Typography sx={{ p: 2 }}>{t('Artikel werden geladen...', 'Loading items...')}</Typography>
                            ) : enrichedStoredItems.length === 0 ? (
                                <Box sx={{ p: 4, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                    <Typography color="text.secondary">{t('In diesem Lagerort sind noch keine Artikel gelagert.', 'No items are stored at this location yet.')}</Typography>
                                </Box>
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
                                            {enrichedStoredItems.map(({ item, totalStock, remaining, checkedOut }) => (
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
                                                        <IconButton size="small" color="primary">
                                                            <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
                                                        </IconButton>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
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
            </Grid>

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{editingLoc ? t('Lagerort bearbeiten', 'Edit storage location') : t('Neuer Lagerort', 'New storage location')}</DialogTitle>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogContent sx={{ pt: 1 }}>
                        <Stack spacing={2}>
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
                            <Button component="label" variant="outlined">
                                {t('Eigene Kartenebene hochladen', 'Upload custom map overlay')}
                                <input hidden type="file" accept="image/*" onChange={(event) => setFormData((current) => ({ ...current, mapOverlayFile: event.target.files?.[0], removeMapOverlay: false }))} />
                            </Button>
                            {editingLoc?.mapOverlay && !formData.removeMapOverlay && (
                                <Button color="error" onClick={() => setFormData((current) => ({ ...current, removeMapOverlay: true, mapOverlayFile: undefined }))}>
                                    {t('Vorhandene Kartenebene entfernen', 'Remove existing map overlay')}
                                </Button>
                            )}
                            <StorageLocationMap
                                editable
                                latitude={formData.latitude}
                                longitude={formData.longitude}
                                zoom={formData.mapZoom}
                                overlayBounds={formData.overlayBounds}
                                overlayUrl={overlayPreview || (editingLoc?.mapOverlay && !formData.removeMapOverlay ? pb.files.getURL(editingLoc, editingLoc.mapOverlay) : undefined)}
                                onCenterChange={(latitude, longitude) => setFormData((current) => ({ ...current, latitude, longitude }))}
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setDialogOpen(false)} color="inherit">
                            {t('Abbrechen', 'Cancel')}
                        </Button>
                        <Button
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
            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                <DialogTitle>{t('Lagerort löschen?', 'Delete storage location?')}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {t('Sind Sie sicher, dass Sie diesen Lagerort löschen möchten? Verknüpfte Artikel verlieren ihren Lagerortbezug. Dies kann nicht rückgängig gemacht werden.', 'Are you sure you want to delete this storage location? Linked items will lose their location reference. This cannot be undone.')}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteConfirmOpen(false)} color="inherit">
                        {t('Abbrechen', 'Cancel')}
                    </Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleteMutation.isPending}>
                        {t('Löschen', 'Delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
