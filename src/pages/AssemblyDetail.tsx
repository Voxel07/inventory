import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Paper,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Skeleton,
    Alert,
    TextField,
    Tooltip,
    Autocomplete,
} from '@mui/material';
import { TooltipButton } from '../components/shared/TooltipButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAssembly, useUpdateAssembly } from '../hooks/useAssemblies';
import { useItems } from '../hooks/useItems';
import { useTransactions, useAssemblyCheckout } from '../hooks/useTransactions';
import { useDamageReports } from '../hooks/useDamageReports';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { useUIStore } from '../store/uiStore';
import type { AssemblyFormData, Item } from '../types';
import { calculateItemStock } from '../utils/stock';
import { formatStatus } from '../utils/formatters';

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    available: 'success',
    checked_out: 'warning',
    damaged: 'error',
    retired: 'default',
};

export function AssemblyDetail() {
    const { assemblyId } = useParams<{ assemblyId: string }>();
    const navigate = useNavigate();
    const { data: assembly, isLoading } = useAssembly(assemblyId ?? '');
    const { data: items } = useItems();
    const { data: transactions } = useTransactions();
    const { data: damageReports } = useDamageReports();
    const updateAssembly = useUpdateAssembly();
    const checkoutAssembly = useAssemblyCheckout();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [editOpen, setEditOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkoutReason, setCheckoutReason] = useState('');
    const [checkoutNotes, setCheckoutNotes] = useState('');
    const [checkoutAmount, setCheckoutAmount] = useState(1);

    function handleUpdate(data: AssemblyFormData) {
        if (!assembly) return;
        updateAssembly.mutate(
            { id: assembly.id, data },
            {
                onSuccess: () => {
                    setEditOpen(false);
                    showSnackbar('Baugruppe aktualisiert', 'success');
                },
                onError: () => showSnackbar('Fehler beim Aktualisieren der Baugruppe', 'error'),
            },
        );
    }

    function handleCheckout() {
        if (!assembly) return;
        const quantities = assembly.itemQuantities ?? {};
        // Build full quantities map including items with default qty 1, multiplied by checkoutAmount
        const fullQuantities: Record<string, number> = {};
        for (const id of assembly.itemIds ?? []) {
            fullQuantities[id] = (quantities[id] ?? 1) * checkoutAmount;
        }
        checkoutAssembly.mutate(
            {
                itemQuantities: fullQuantities,
                assemblyName: assembly.name,
                reason: checkoutReason || `Assembly checkout: ${assembly.name} (Amount: ${checkoutAmount})`,
                notes: checkoutNotes,
            },
            {
                onSuccess: () => {
                    setCheckoutOpen(false);
                    setCheckoutReason('');
                    setCheckoutNotes('');
                    setCheckoutAmount(1);
                    showSnackbar('Baugruppe erfolgreich ausgecheckt', 'success');
                },
                onError: () => showSnackbar('Fehler beim Auschecken der Baugruppe', 'error'),
            },
        );
    }

    function handleAddItem(itemId: string) {
        if (!assembly) return;
        const updatedItemIds = [...(assembly.itemIds ?? []), itemId];
        const updatedQuantities = {
            ...(assembly.itemQuantities ?? {}),
            [itemId]: 1, // Default quantity to 1
        };
        updateAssembly.mutate(
            {
                id: assembly.id,
                data: {
                    itemIds: updatedItemIds,
                    itemQuantities: updatedQuantities,
                },
            },
            {
                onSuccess: () => showSnackbar('Artikel zur Baugruppe hinzugefügt', 'success'),
                onError: () => showSnackbar('Fehler beim Hinzufügen des Artikels', 'error'),
            }
        );
    }

    function handleRemoveItem(itemId: string) {
        if (!assembly) return;
        const updatedItemIds = (assembly.itemIds ?? []).filter((id) => id !== itemId);
        const updatedQuantities = { ...(assembly.itemQuantities ?? {}) };
        delete updatedQuantities[itemId];
        updateAssembly.mutate(
            {
                id: assembly.id,
                data: {
                    itemIds: updatedItemIds,
                    itemQuantities: updatedQuantities,
                },
            },
            {
                onSuccess: () => showSnackbar('Artikel aus der Baugruppe entfernt', 'success'),
                onError: () => showSnackbar('Fehler beim Entfernen des Artikels', 'error'),
            }
        );
    }

    // Calculate available stock for each item
    const stockInfo = useMemo(() => {
        if (!items || !transactions) return new Map<string, number>();
        const map = new Map<string, number>();
        for (const item of items) {
            const { remaining } = calculateItemStock(item.id, transactions, damageReports);
            map.set(item.id, remaining);
        }
        return map;
    }, [items, transactions, damageReports]);

    if (isLoading) {
        return (
            <Box>
                <Skeleton height={60} width={300} />
                <Skeleton height={200} />
            </Box>
        );
    }

    if (!assembly) {
        return (
            <Box>
                <TooltipButton
                    tooltipText="Zurück zur Baugruppenübersicht"
                    icon={<ArrowBackIcon />}
                    label="Zurück zu den Baugruppen"
                    variant="text"
                    onClick={() => navigate('/assemblies')}
                />
                <Typography variant="h5" sx={{ mt: 2 }}>
                    Baugruppe nicht gefunden
                </Typography>
            </Box>
        );
    }

    const assemblyItems: Item[] = assembly.expand?.itemIds?.length
        ? assembly.expand.itemIds
        : (assembly.itemIds ?? [])
            .map((id) => items?.find((i) => i.id === id))
            .filter((i): i is Item => !!i);

    const totalValue = assemblyItems.reduce(
        (sum, item) => sum + (item.value ?? 0) * (assembly.itemQuantities?.[item.id] ?? 1), 0,
    );

    // Check which items have insufficient stock
    const insufficientItems = assemblyItems.filter((item) => {
        const needed = assembly.itemQuantities?.[item.id] ?? 1;
        const available = stockInfo.get(item.id) ?? 0;
        return available < needed;
    });

    const canCheckout = insufficientItems.length === 0 && assemblyItems.length > 0;

    const maxAssembliesPossible = (() => {
        if (assemblyItems.length === 0) return 0;
        let minPossible = Infinity;
        for (const item of assemblyItems) {
            const needed = assembly.itemQuantities?.[item.id] ?? 1;
            const available = stockInfo.get(item.id) ?? 0;
            const possible = Math.floor(available / needed);
            if (possible < minPossible) {
                minPossible = possible;
            }
        }
        return minPossible === Infinity ? 0 : minPossible;
    })();

    const availableItemsToAdd = (() => {
        if (!items || !assembly) return [];
        return items.filter((item) => !(assembly.itemIds ?? []).includes(item.id));
    })();

    return (
        <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                <TooltipButton
                    variant="icon"
                    tooltipText="Zurück zur Baugruppenübersicht"
                    icon={<ArrowBackIcon />}
                    onClick={() => navigate('/assemblies')}
                />
                <Typography variant="h4" sx={{ flexGrow: 1 }}>
                    {assembly.name}
                </Typography>
                <TooltipButton
                    variant="icon"
                    tooltipText="Baugruppendetails bearbeiten"
                    icon={<EditIcon />}
                    onClick={() => setEditOpen(true)}
                />
                <TooltipButton
                    tooltipText="Alle Artikel dieser Baugruppe ausleihen"
                    icon={<ShoppingCartCheckoutIcon />}
                    label="Ausleihen"
                    variant="contained"
                    onClick={() => setCheckoutOpen(true)}
                    disabled={!canCheckout}
                />

            </Box>

            {insufficientItems.length > 0 && (
                <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 3 }}>
                    Unzureichender Bestand für: {insufficientItems.map((i) => {
                        const needed = assembly.itemQuantities?.[i.id] ?? 1;
                        const available = stockInfo.get(i.id) ?? 0;
                        return `${i.name} (benötigt: ${needed}, vorhanden: ${available})`;
                    }).join(', ')}
                </Alert>
            )}

            {assembly.description && (
                <Paper sx={{ p: 2, mb: 3 }}>
                    <Typography variant="body1">{assembly.description}</Typography>
                </Paper>
            )}

            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">Komponenten</Typography>
                    <Typography variant="h6">{assemblyItems.length}</Typography>
                </Paper>
                <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">Gesamtwert</Typography>
                    <Typography variant="h6">{totalValue.toFixed(2)} €</Typography>
                </Paper>
                <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">Für Ausleihe verfügbar</Typography>
                    <Typography variant="h6" color={maxAssembliesPossible > 0 ? "success.main" : "text.secondary"}>
                        {maxAssembliesPossible}
                    </Typography>
                </Paper>
                <Paper sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">Erstellt</Typography>
                    <Typography variant="h6">{new Date(assembly.created).toLocaleDateString()}</Typography>
                </Paper>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h6">
                    Komponenten in dieser Baugruppe
                </Typography>
                <Autocomplete
                    options={availableItemsToAdd}
                    getOptionLabel={(option) => option.name}
                    onChange={(_e, newItem) => {
                        if (newItem) handleAddItem(newItem.id);
                    }}
                    renderInput={(params) => (
                        <TextField {...params} label="Artikel schnell hinzufügen" size="small" />
                    )}
                    sx={{ minWidth: 250, maxWidth: 350 }}
                    value={null}
                />
            </Box>

            {assemblyItems.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">Keine Komponenten in dieser Baugruppe</Typography>
                </Paper>
            ) : (
                <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell align="right">Menge</TableCell>
                                <TableCell align="right">Verfügbar</TableCell>
                                <TableCell>Kategorie</TableCell>
                                <TableCell>Lagerort</TableCell>
                                <TableCell align="right">Wert</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Aktionen</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {assemblyItems.map((item) => {
                                const qty = assembly.itemQuantities?.[item.id] ?? 1;
                                const available = stockInfo.get(item.id) ?? 0;
                                const isInsufficient = available < qty;
                                return (
                                    <TableRow
                                        key={item.id}
                                        hover
                                        onClick={() => navigate(`/items/${item.id}`)}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {item.name}
                                                {isInsufficient && (
                                                    <WarningAmberIcon fontSize="small" color="warning" />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="right">{qty}</TableCell>
                                        <TableCell align="right">
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    color: isInsufficient ? 'error.main' : 'success.main',
                                                    fontWeight: isInsufficient ? 700 : 400,
                                                }}
                                            >
                                                {available}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{item.category || '—'}</TableCell>
                                        <TableCell>
                                            {(() => {
                                                const loc = item.expand?.storageLocation;
                                                return loc
                                                    ? [loc.name, loc.location, loc.position].filter(Boolean).join(' / ')
                                                    : item.storageLocation || '—';
                                            })()}
                                        </TableCell>
                                        <TableCell align="right">{((item.value ?? 0) * qty).toFixed(2)} €</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={formatStatus(item.status)}
                                                color={statusColors[item.status] ?? 'default'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                            <TooltipButton
                                                variant="icon"
                                                tooltipText="Artikel aus Baugruppe entfernen"
                                                icon={<DeleteIcon />}
                                                size="small"
                                                color="error"
                                                onClick={() => handleRemoveItem(item.id)}
                                            />
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Checkout Dialog */}
            <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Baugruppe ausleihen</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        Dies leiht alle Artikel in „{assembly.name}“ mit den angegebenen Mengen aus.
                    </DialogContentText>
                    <TextField
                        label="Auszuleihende Menge"
                        type="number"
                        value={checkoutAmount}
                        onChange={(e) => {
                            const val = Math.max(1, Math.min(maxAssembliesPossible, Number(e.target.value) || 1));
                            setCheckoutAmount(val);
                        }}
                        fullWidth
                        sx={{ mb: 2 }}
                        slotProps={{ htmlInput: { min: 1, max: maxAssembliesPossible } }}
                    />
                    <TextField
                        label="Grund"
                        value={checkoutReason}
                        onChange={(e) => setCheckoutReason(e.target.value)}
                        fullWidth
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        label="Anmerkungen (optional)"
                        value={checkoutNotes}
                        onChange={(e) => setCheckoutNotes(e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                    />
                </DialogContent>
                <DialogActions>
                    <Tooltip title="Ausleihvorgang abbrechen" arrow>
                        <Button onClick={() => setCheckoutOpen(false)}>Abbrechen</Button>
                    </Tooltip>
                    <Tooltip title="Alle Artikel in dieser Baugruppe dauerhaft ausleihen" arrow>
                        <Button
                            variant="contained"
                            onClick={handleCheckout}
                            disabled={checkoutAssembly.isPending}
                        >
                            Alle Artikel ausleihen
                        </Button>
                    </Tooltip>
                </DialogActions>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Baugruppe bearbeiten</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <AssemblyForm
                        initialData={assembly}
                        items={items ?? []}
                        onSubmit={handleUpdate}
                        isLoading={updateAssembly.isPending}
                    />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
