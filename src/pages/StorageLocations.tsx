import { useState, useMemo } from 'react';
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

export function StorageLocations() {
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

    const [formData, setFormData] = useState({
        name: '',
        area: '',
        description: '',
        location: '',
        position: '',
    });

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
            const { totalStock, remaining, checkedOut } = calculateItemStock(item.id, transactions, damageReports);
            return { item, totalStock, remaining, checkedOut };
        });
    }, [storedItems, transactions, damageReports]);

    function handleOpenCreate() {
        setEditingLoc(null);
        setFormData({ name: '', area: '', description: '', location: '', position: '' });
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
                        showSnackbar('Lagerort erfolgreich aktualisiert', 'success');
                    },
                    onError: () => showSnackbar('Fehler beim Aktualisieren des Lagerorts', 'error'),
                }
            );
        } else {
            createMutation.mutate(formData, {
                onSuccess: (newLoc) => {
                    setDialogOpen(false);
                    setSelectedLocId(newLoc.id);
                    showSnackbar('Lagerort erfolgreich erstellt', 'success');
                },
                onError: () => showSnackbar('Fehler beim Erstellen des Lagerorts', 'error'),
            });
        }
    }

    function handleDeleteConfirm() {
        if (!selectedLocId) return;
        deleteMutation.mutate(selectedLocId, {
            onSuccess: () => {
                setDeleteConfirmOpen(false);
                setSelectedLocId(null);
                showSnackbar('Lagerort gelöscht', 'success');
            },
            onError: () => showSnackbar('Fehler beim Löschen des Lagerorts', 'error'),
        });
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    Lagerorte
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleOpenCreate}
                >
                    Lagerort hinzufügen
                </Button>
            </Box>

            <Grid container spacing={3}>
                {/* Left Column: Locations List */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', overflow: 'hidden' }}>
                        <TextField
                            label="Lagerorte suchen"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            size="small"
                            fullWidth
                            sx={{ mb: 2 }}
                        />

                        {locationsLoading ? (
                            <Typography sx={{ p: 2 }}>Lagerorte werden geladen...</Typography>
                        ) : filteredLocations.length === 0 ? (
                            <Typography sx={{ p: 2 }} color="text.secondary">
                                Keine Lagerorte gefunden
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
                                                '&.Mui-selected': {
                                                    backgroundColor: 'rgba(124, 77, 255, 0.08)',
                                                    '&:hover': {
                                                        backgroundColor: 'rgba(124, 77, 255, 0.15)',
                                                    },
                                                },
                                            }}
                                        >
                                            <ListItemText
                                                primary={
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                                            {loc.name}
                                                        </Typography>
                                                        <Chip label={count === 1 ? '1 Artikel' : `${count} Artikel`} size="small" variant="outlined" />
                                                    </Box>
                                                }
                                                secondary={loc.area || 'Kein Bereich angegeben'}
                                            />
                                            <Box sx={{ display: 'flex', ml: 1 }} onClick={(e) => e.stopPropagation()}>
                                                <IconButton size="small" onClick={(e) => handleOpenEdit(loc, e)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" color="error" onClick={(e) => handleOpenDelete(loc.id, e)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
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

                            <Divider sx={{ mb: 3 }} />

                            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                                Hier gelagerte Artikel
                            </Typography>

                            {itemsLoading ? (
                                <Typography sx={{ p: 2 }}>Artikel werden geladen...</Typography>
                            ) : enrichedStoredItems.length === 0 ? (
                                <Box sx={{ p: 4, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                    <Typography color="text.secondary">In diesem Lagerort sind noch keine Artikel gelagert.</Typography>
                                </Box>
                            ) : (
                                <TableContainer sx={{ flexGrow: 1, overflowY: 'auto' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Artikelname</TableCell>
                                                <TableCell>Kategorie</TableCell>
                                                <TableCell align="right">Verfügbarer Bestand</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell align="right">Aktionen</TableCell>
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
                                    Wählen Sie einen Lagerort aus der Liste aus, um die gelagerten Artikel anzuzeigen
                                </Typography>
                            </Box>
                        </Paper>
                    )}
                </Grid>
            </Grid>

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{editingLoc ? 'Lagerort bearbeiten' : 'Neuer Lagerort'}</DialogTitle>
                <Box component="form" onSubmit={handleSubmit}>
                    <DialogContent sx={{ pt: 1 }}>
                        <Stack spacing={2}>
                            <TextField
                                label="Name des Lagerorts"
                                value={formData.name}
                                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                                required
                                fullWidth
                                autoFocus
                            />
                            <TextField
                                        label="Bereich / Sektion"
                                        placeholder="z. B. Regal A, Raum 204"
                                        value={formData.area}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, area: e.target.value }))}
                                        fullWidth
                                    />
                                    <TextField
                                        label="Ort / Gebäude"
                                        placeholder="z. B. Gebäude B, Raum 204"
                                        value={formData.location}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
                                        fullWidth
                                    />
                                    <TextField
                                        label="Position / Regal"
                                        placeholder="z. B. Reihe 3, Fach 2"
                                        value={formData.position}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
                                        fullWidth
                                    />
                            <TextField
                                label="Beschreibung"
                                value={formData.description}
                                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                                multiline
                                rows={3}
                                fullWidth
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setDialogOpen(false)} color="inherit">
                            Abbrechen
                        </Button>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={createMutation.isPending || updateMutation.isPending || !formData.name}
                        >
                            Speichern
                        </Button>
                    </DialogActions>
                </Box>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                <DialogTitle>Lagerort löschen?</DialogTitle>
                <DialogContent>
                    <Typography>
                        Sind Sie sicher, dass Sie diesen Lagerort löschen möchten? Verknüpfte Artikel verlieren ihren Lagerortbezug. Dies kann nicht rückgängig gemacht werden.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteConfirmOpen(false)} color="inherit">
                        Abbrechen
                    </Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleteMutation.isPending}>
                        Löschen
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
