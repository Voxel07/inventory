import { MediaImage } from '../common/MediaImage';
import { apiFileUrl } from '../../services/apiClient';
import { useEffect, useMemo, useState } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Skeleton,
    Typography,
    Stack,
    Menu,
    MenuItem,
    IconButton,
    ListItemIcon,
    ListItemText,
    Tooltip,
    Box,
    Button,
    Checkbox,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import MenuIcon from '@mui/icons-material/Menu';
import { useNavigate } from 'react-router-dom';
import { TooltipButton } from '../shared/TooltipButton';
import type { Assembly, DamageReport, Item, StockTransaction } from '../../types';
import { useLocalizedText } from '../../utils/naming';
import { assemblyAvailability } from '../../utils/factionOrderQuantities';
import { calculateItemStock } from '../../utils/stock';

interface Props {
    assemblies: Assembly[] | undefined;
    items: Item[] | undefined;
    transactions: StockTransaction[] | undefined;
    damageReports: DamageReport[] | undefined;
    isLoading: boolean;
    onEdit: (assembly: Assembly) => void;
    onDelete: (id: string) => void;
    onDeleteMany: (ids: string[]) => void;
}

export function AssembliesList({ assemblies, items, transactions, damageReports, isLoading, onEdit, onDelete, onDeleteMany }: Props) {
    const t = useLocalizedText();
    const navigate = useNavigate();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [selectedAssembly, setSelectedAssembly] = useState<Assembly | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const stockByItemId = useMemo(() => new Map((items ?? []).map((item) => [
        item.id,
        calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0, item),
    ])), [damageReports, items, transactions]);

    useEffect(() => {
        const validIds = new Set(assemblies?.map((assembly) => assembly.id) ?? []);
        setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
    }, [assemblies]);

    function toggleSelection(id: string) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, assembly: Assembly) => {
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
        setSelectedAssembly(assembly);
    };

    const handleCloseMenu = () => {
        setAnchorEl(null);
        setSelectedAssembly(null);
    };

    const handleView = () => {
        if (selectedAssembly) {
            navigate(`/assemblies/${selectedAssembly.id}`);
        }
        handleCloseMenu();
    };

    const handleEdit = () => {
        if (selectedAssembly) {
            onEdit(selectedAssembly);
        }
        handleCloseMenu();
    };

    const handleDelete = () => {
        if (selectedAssembly) {
            onDelete(selectedAssembly.id);
        }
        handleCloseMenu();
    };

    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    if (!assemblies?.length) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">{t('Keine Baugruppen gefunden', 'No assemblies found')}</Typography>
            </Paper>
        );
    }

    function getExpandedItems(assembly: Assembly): Item[] {
        if (assembly.expand?.itemIds?.length) return assembly.expand.itemIds;
        if (!Array.isArray(assembly.itemIds) || !items) return [];
        return assembly.itemIds
            .map((id) => items.find((i) => i.id === id))
            .filter((i): i is Item => !!i);
    }

    function getAssemblyTotalValue(assembly: Assembly): number {
        const quantities = assembly.itemQuantities ?? {};
        return getExpandedItems(assembly).reduce(
            (sum, item) => sum + (item.value ?? 0) * (quantities[item.id] ?? 1), 0,
        );
    }

    function getAssemblyStock(assembly: Assembly) {
        return {
            totalStock: assemblyAvailability(assembly, (itemId) => stockByItemId.get(itemId)?.totalStock ?? 0),
            remaining: assemblyAvailability(assembly, (itemId) => stockByItemId.get(itemId)?.remaining ?? 0),
        };
    }

    return (
        <Box>
            {selectedIds.size > 0 && (
                <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1, mb: 2 }}>
                    <Typography sx={{ fontWeight: 700 }}>
                        {t(`${selectedIds.size} ${selectedIds.size === 1 ? 'Baugruppe' : 'Baugruppen'} ausgewählt`, `${selectedIds.size} assembl${selectedIds.size === 1 ? 'y' : 'ies'} selected`)}
                    </Typography>
                    <Button color="error" size="small" startIcon={<DeleteIcon />} onClick={() => onDeleteMany([...selectedIds])}>
                        {t('Auswahl löschen', 'Delete selected')}
                    </Button>
                </Paper>
            )}
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell padding="checkbox">
                            <Checkbox
                                size="small"
                                checked={assemblies.length > 0 && assemblies.every((assembly) => selectedIds.has(assembly.id))}
                                indeterminate={assemblies.some((assembly) => selectedIds.has(assembly.id)) && !assemblies.every((assembly) => selectedIds.has(assembly.id))}
                                onChange={() => {
                                    const allSelected = assemblies.every((assembly) => selectedIds.has(assembly.id));
                                    setSelectedIds(allSelected ? new Set() : new Set(assemblies.map((assembly) => assembly.id)));
                                }}
                                slotProps={{ input: { 'aria-label': t('Alle Baugruppen auswählen', 'Select all assemblies') } }}
                            />
                        </TableCell>
                        <TableCell>{t('Name', 'Name')}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Beschreibung', 'Description')}</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{t('Komponenten', 'Components')}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{t('Bestand', 'Stock')}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: 120 }}>{t('Gesamtwert', 'Total value')}</TableCell>
                        <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {assemblies.map((assembly) => {
                        const assemblyItems = getExpandedItems(assembly);
                        const { totalStock, remaining } = getAssemblyStock(assembly);
                        return (
                            <TableRow
                                key={assembly.id}
                                hover
                                onClick={() => navigate(`/assemblies/${assembly.id}`)}
                                sx={{ cursor: 'pointer' }}
                            >
                                <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                                    <Checkbox
                                        size="small"
                                        checked={selectedIds.has(assembly.id)}
                                        onChange={() => toggleSelection(assembly.id)}
                                        slotProps={{ input: { 'aria-label': t(`${assembly.name} auswählen`, `Select ${assembly.name}`) } }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                        {assembly.image && <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name} sx={{ width: 64, height: 48, objectFit: 'contain', borderRadius: 0.75, flexShrink: 0 }} />}
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{assembly.name}</Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                                    {assembly.description}
                                </TableCell>
                                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
                                        {assemblyItems.map((item) => {
                                            const qty = assembly.itemQuantities?.[item.id] ?? 1;
                                            return (
                                                <Chip
                                                    key={item.id}
                                                    label={qty > 1 ? `${qty}× ${item.name}` : item.name}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            );
                                        })}
                                    </Stack>
                                </TableCell>
                                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                    <Typography
                                        component="span"
                                        variant="body2"
                                        sx={{ color: remaining > 0 ? 'success.main' : 'error.main', fontWeight: remaining <= 0 ? 700 : 400 }}
                                    >
                                        {remaining}/{totalStock}
                                    </Typography>
                                </TableCell>
                                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                    {getAssemblyTotalValue(assembly).toFixed(2)} €
                                </TableCell>
                                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                    {/* Burger menu for small screens (xs) */}
                                    <Box sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
                                        <Tooltip title={t('Aktionen', 'Actions')} arrow>
                                            <IconButton
                                                onClick={(e) => handleOpenMenu(e, assembly)}
                                                size="small"
                                            >
                                                <MenuIcon />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>

                                    {/* Individual buttons for larger screens (sm and up) */}
                                    <Box sx={{ display: { xs: 'none', sm: 'inline-flex' }, gap: 0.5 }}>
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText={t('Baugruppendetails anzeigen', 'View assembly details')}
                                            icon={<VisibilityIcon />}
                                            size="small"
                                            color="info"
                                            onClick={() => navigate(`/assemblies/${assembly.id}`)}
                                        />
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText={t('Baugruppe bearbeiten', 'Edit assembly')}
                                            icon={<EditIcon />}
                                            size="small"
                                            color="warning"
                                            onClick={() => onEdit(assembly)}
                                        />
                                        <TooltipButton
                                            variant="icon"
                                            tooltipText={t('Baugruppe löschen', 'Delete assembly')}
                                            icon={<DeleteIcon />}
                                            size="small"
                                            color="error"
                                            onClick={() => onDelete(assembly.id)}
                                        />
                                    </Box>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
                </Table>

            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleCloseMenu}
                onClick={(e) => e.stopPropagation()}
            >
                <MenuItem onClick={handleView}>
                    <ListItemIcon>
                        <VisibilityIcon fontSize="small" color="info" />
                    </ListItemIcon>
                    <ListItemText>{t('Details anzeigen', 'View details')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleEdit}>
                    <ListItemIcon>
                        <EditIcon fontSize="small" color="warning" />
                    </ListItemIcon>
                    <ListItemText>{t('Bearbeiten', 'Edit')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDelete}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText>{t('Löschen', 'Delete')}</ListItemText>
                </MenuItem>
            </Menu>
            </TableContainer>
        </Box>
    );
}
