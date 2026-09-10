import { useState, useMemo } from 'react';
import {
    Box,
    Paper,
    Typography,
    Stack,
    Button,
    TextField,
    MenuItem,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    CircularProgress,
    Tooltip,
    Card,
    CardContent,
    useTheme,
    useMediaQuery,
    Checkbox,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import type { Item, AssetInstance, AssetInstanceInput } from '../../types';
import { useItemAssets, useCreateItemAsset, useUpdateItemAsset, useDeleteItemAsset } from '../../hooks/useItems';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useLocalizedText } from '../../utils/naming';
import { QRCodeGenerator } from '../qr/QRCodeGenerator';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface Props {
    item: Item;
}

const statusColorMap: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    available: 'success',
    in_custody: 'warning',
    in_field: 'warning',
    in_maintenance: 'info',
    in_repair: 'warning',
    damaged: 'error',
    written_off: 'default',
};

export function AssetInstancesList({ item }: Props) {
    const t = useLocalizedText();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const { data: assets, isLoading } = useItemAssets(item.id);
    const { data: storageLocations } = useStorageLocations();

    const createAsset = useCreateItemAsset(item.id);
    const updateAsset = useUpdateItemAsset(item.id);
    const deleteAsset = useDeleteItemAsset(item.id);

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Dialogs
    const [addSingleOpen, setAddSingleOpen] = useState(false);
    const [batchOpen, setBatchOpen] = useState(false);
    const [editAsset, setEditAsset] = useState<AssetInstance | null>(null);
    const [qrAsset, setQrAsset] = useState<AssetInstance | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AssetInstance | null>(null);

    // Form states
    const [singleInput, setSingleInput] = useState<AssetInstanceInput>({
        assetCode: '',
        serialNumber: '',
        manufacturer: '',
        model: '',
        conditionStatus: 'good',
        availabilityStatus: 'available',
        currentLocationId: item.storageLocation,
        operatingHours: undefined,
        notes: '',
    });

    const [batchInput, setBatchInput] = useState({
        batchCount: 5,
        codePrefix: item.sku ? `${item.sku}-` : 'ASSET-',
        startNumber: 1,
        conditionStatus: 'good',
        availabilityStatus: 'available',
        currentLocationId: item.storageLocation,
    });

    const [editInput, setEditInput] = useState<AssetInstanceInput>({});

    const updateSingle = (patch: Partial<AssetInstanceInput>) =>
        setSingleInput((prev: AssetInstanceInput) => ({ ...prev, ...patch }));
    const updateEdit = (patch: Partial<AssetInstanceInput>) =>
        setEditInput((prev: AssetInstanceInput) => ({ ...prev, ...patch }));

    const filteredAssets = useMemo(() => {
        if (!assets) return [];
        return assets.filter((asset) => {
            const matchesSearch = !search.trim()
                || asset.assetCode.toLowerCase().includes(search.toLowerCase())
                || (asset.serialNumber && asset.serialNumber.toLowerCase().includes(search.toLowerCase()))
                || (asset.notes && asset.notes.toLowerCase().includes(search.toLowerCase()))
                || (asset.currentCustodianName && asset.currentCustodianName.toLowerCase().includes(search.toLowerCase()));
            const matchesStatus = !statusFilter || asset.availabilityStatus === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [assets, search, statusFilter]);

    // Metrics
    const metrics = useMemo(() => {
        if (!assets) return { total: 0, available: 0, inCustody: 0, maintenance: 0, damaged: 0 };
        return {
            total: assets.length,
            available: assets.filter((a) => a.availabilityStatus === 'available').length,
            inCustody: assets.filter((a) => a.availabilityStatus === 'in_custody' || a.availabilityStatus === 'in_field').length,
            maintenance: assets.filter((a) => a.availabilityStatus === 'in_maintenance' || a.availabilityStatus === 'in_repair').length,
            damaged: assets.filter((a) => a.availabilityStatus === 'damaged' || a.conditionStatus === 'damaged' || a.conditionStatus === 'unsafe').length,
        };
    }, [assets]);

    function handleOpenAddSingle() {
        const nextNum = (assets?.length ?? 0) + 1;
        setSingleInput({
            assetCode: item.sku ? `${item.sku}-${String(nextNum).padStart(3, '0')}` : '',
            serialNumber: '',
            manufacturer: '',
            model: '',
            conditionStatus: 'good',
            availabilityStatus: 'available',
            currentLocationId: item.storageLocation,
            operatingHours: undefined,
            notes: '',
        });
        setAddSingleOpen(true);
    }

    function handleOpenBatch() {
        const nextNum = (assets?.length ?? 0) + 1;
        setBatchInput({
            batchCount: 5,
            codePrefix: item.sku ? `${item.sku}-` : 'ASSET-',
            startNumber: nextNum,
            conditionStatus: 'good',
            availabilityStatus: 'available',
            currentLocationId: item.storageLocation,
        });
        setBatchOpen(true);
    }

    function handleOpenEdit(asset: AssetInstance) {
        setEditAsset(asset);
        setEditInput({
            assetCode: asset.assetCode,
            serialNumber: asset.serialNumber || '',
            conditionStatus: asset.conditionStatus,
            availabilityStatus: asset.availabilityStatus,
            currentLocationId: asset.currentLocationId || '',
            operatingHours: asset.operatingHours,
            notes: asset.notes || '',
        });
    }

    function handleSaveSingle() {
        createAsset.mutate(singleInput, {
            onSuccess: () => setAddSingleOpen(false),
        });
    }

    function handleSaveBatch() {
        createAsset.mutate({
            batchCount: Number(batchInput.batchCount),
            codePrefix: batchInput.codePrefix,
            startNumber: Number(batchInput.startNumber),
            conditionStatus: batchInput.conditionStatus as any,
            availabilityStatus: batchInput.availabilityStatus as any,
            currentLocationId: batchInput.currentLocationId,
        }, {
            onSuccess: () => setBatchOpen(false),
        });
    }

    function handleSaveEdit() {
        if (!editAsset) return;
        updateAsset.mutate({
            assetId: editAsset.id,
            input: editInput,
        }, {
            onSuccess: () => setEditAsset(null),
        });
    }

    function handleDeleteConfirm() {
        if (!deleteTarget) return;
        deleteAsset.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
        });
    }

    function toggleSelect(id: string) {
        setSelectedIds((prev: Set<string>) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    return (
        <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DynamicFeedIcon color="primary" />
                        {t('Einzelgeräte & Seriennummern (Assets)', 'Serialized Assets & Sub-Units')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t('Physisch identifizierte Einzelstücke mit individuellem Status, QR-Code und Wartungshistorie.', 'Individually identified physical units with distinct statuses, QR codes, and maintenance history.')}
                    </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DynamicFeedIcon />}
                        onClick={handleOpenBatch}
                    >
                        {t('Stapel generieren', 'Batch generate')}
                    </Button>
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={handleOpenAddSingle}
                    >
                        {t('Asset hinzufügen', 'Add asset')}
                    </Button>
                </Stack>
            </Box>

            {/* Metrics Chips */}
            <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
                <Chip label={`${t('Gesamt', 'Total')}: ${metrics.total}`} variant="outlined" />
                <Chip label={`${t('Verfügbar', 'Available')}: ${metrics.available}`} color="success" />
                <Chip label={`${t('Im Einsatz / Ausgeliehen', 'In custody')}: ${metrics.inCustody}`} color="warning" />
                {metrics.maintenance > 0 && (
                    <Chip label={`${t('In Wartung / Reparatur', 'In maintenance')}: ${metrics.maintenance}`} color="info" />
                )}
                {metrics.damaged > 0 && (
                    <Chip label={`${t('Defekt', 'Damaged')}: ${metrics.damaged}`} color="error" />
                )}
            </Stack>

            {/* Toolbar / Search */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    placeholder={t('Nach Asset-ID, Seriennummer, Besitzer suchen...', 'Search asset ID, serial number, custodian...')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    sx={{ flexGrow: 1, minWidth: 200 }}
                />
                <TextField
                    select
                    size="small"
                    label={t('Status filtern', 'Filter status')}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    sx={{ minWidth: 160 }}
                >
                    <MenuItem value="">{t('Alle Status', 'All statuses')}</MenuItem>
                    <MenuItem value="available">{t('Verfügbar', 'Available')}</MenuItem>
                    <MenuItem value="in_custody">{t('Ausgeliehen / Im Einsatz', 'In custody')}</MenuItem>
                    <MenuItem value="reserved">{t('Reserviert', 'Reserved')}</MenuItem>
                    <MenuItem value="in_maintenance">{t('In Wartung', 'In maintenance')}</MenuItem>
                    <MenuItem value="in_repair">{t('In Reparatur', 'In repair')}</MenuItem>
                    <MenuItem value="damaged">{t('Defekt', 'Damaged')}</MenuItem>
                </TextField>
            </Box>

            {/* Content Table / Cards */}
            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : filteredAssets.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography color="text.secondary">
                        {t('Keine Einzelgeräte für diesen Artikel vorhanden.', 'No asset instances recorded for this item.')}
                    </Typography>
                    <Button
                        size="small"
                        sx={{ mt: 1 }}
                        startIcon={<AddIcon />}
                        onClick={handleOpenAddSingle}
                    >
                        {t('Erstes Asset registrieren', 'Register first asset')}
                    </Button>
                </Box>
            ) : isMobile ? (
                <Stack spacing={1.5}>
                    {filteredAssets.map((asset) => (
                        <Card key={asset.id} variant="outlined">
                            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                    <Box>
                                        <Typography sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem' }}>
                                            {asset.assetCode}
                                        </Typography>
                                        {asset.serialNumber && (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                S/N: {asset.serialNumber}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={asset.availabilityStatus}
                                        color={statusColorMap[asset.availabilityStatus] || 'default'}
                                    />
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, fontSize: '0.8rem', color: 'text.secondary', mb: 1 }}>
                                    <div>{t('Zustand', 'Condition')}: <strong>{asset.conditionStatus}</strong></div>
                                    <div>{t('Lagerort', 'Location')}: <strong>{asset.currentLocationName || '—'}</strong></div>
                                    {asset.operatingHours != null && (
                                        <div>{t('Stunden', 'Hours')}: <strong>{asset.operatingHours} h</strong></div>
                                    )}
                                    {asset.currentCustodianName && (
                                        <div>{t('Besitzer', 'Custodian')}: <strong>{asset.currentCustodianName}</strong></div>
                                    )}
                                </Box>
                                <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                                    <IconButton size="small" onClick={() => setQrAsset(asset)} title={t('QR-Code', 'QR Code')}>
                                        <QrCode2Icon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => handleOpenEdit(asset)} title={t('Bearbeiten', 'Edit')}>
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(asset)} title={t('Löschen', 'Delete')}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            ) : (
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: 40 }}></TableCell>
                                <TableCell><strong>{t('Asset-Code / ID', 'Asset Code / ID')}</strong></TableCell>
                                <TableCell><strong>{t('Seriennummer', 'Serial Number')}</strong></TableCell>
                                <TableCell><strong>{t('Status', 'Status')}</strong></TableCell>
                                <TableCell><strong>{t('Zustand', 'Condition')}</strong></TableCell>
                                <TableCell><strong>{t('Lagerort', 'Location')}</strong></TableCell>
                                <TableCell><strong>{t('Betriebsstunden', 'Operating Hours')}</strong></TableCell>
                                <TableCell><strong>{t('Besitzer / Faktion', 'Custodian')}</strong></TableCell>
                                <TableCell align="right"><strong>{t('Aktionen', 'Actions')}</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredAssets.map((asset) => (
                                <TableRow key={asset.id} hover selected={selectedIds.has(asset.id)}>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            size="small"
                                            checked={selectedIds.has(asset.id)}
                                            onChange={() => toggleSelect(asset.id)}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                        {asset.assetCode}
                                    </TableCell>
                                    <TableCell>{asset.serialNumber || '—'}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={asset.availabilityStatus}
                                            color={statusColorMap[asset.availabilityStatus] || 'default'}
                                        />
                                    </TableCell>
                                    <TableCell>{asset.conditionStatus}</TableCell>
                                    <TableCell>{asset.currentLocationName || '—'}</TableCell>
                                    <TableCell>{asset.operatingHours != null ? `${asset.operatingHours} h` : '—'}</TableCell>
                                    <TableCell>{asset.currentCustodianName || '—'}</TableCell>
                                    <TableCell align="right">
                                        <Tooltip title={t('QR-Code anzeigen', 'Show QR code')}>
                                            <IconButton size="small" onClick={() => setQrAsset(asset)}>
                                                <QrCode2Icon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('Bearbeiten', 'Edit')}>
                                            <IconButton size="small" onClick={() => handleOpenEdit(asset)}>
                                                <EditIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('Ausmustern / Löschen', 'Retire / Delete')}>
                                            <IconButton size="small" color="error" onClick={() => setDeleteTarget(asset)}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Dialog: Add Single Asset */}
            <Dialog open={addSingleOpen} onClose={() => setAddSingleOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('Einzelnes Asset anlegen', 'Add Single Asset')}</DialogTitle>
                <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label={t('Asset-Code / Identifikationsnummer', 'Asset Code / ID')}
                        value={singleInput.assetCode || ''}
                        onChange={(e) => updateSingle({ assetCode: e.target.value })}
                        fullWidth
                        helperText={t('z. B. GEN-001, WT-001 (wird bei Leerlassen generiert)', 'e.g. GEN-001, WT-001 (auto-generated if empty)')}
                    />
                    <TextField
                        label={t('Seriennummer des Herstellers', 'Manufacturer Serial Number')}
                        value={singleInput.serialNumber || ''}
                        onChange={(e) => updateSingle({ serialNumber: e.target.value })}
                        fullWidth
                    />
                    <TextField
                        select
                        label={t('Status', 'Status')}
                        value={singleInput.availabilityStatus || 'available'}
                        onChange={(e) => updateSingle({ availabilityStatus: e.target.value as any })}
                        fullWidth
                    >
                        <MenuItem value="available">{t('Verfügbar', 'Available')}</MenuItem>
                        <MenuItem value="in_custody">{t('Ausgeliehen / Im Einsatz', 'In custody')}</MenuItem>
                        <MenuItem value="in_maintenance">{t('In Wartung', 'In maintenance')}</MenuItem>
                        <MenuItem value="in_repair">{t('In Reparatur', 'In repair')}</MenuItem>
                        <MenuItem value="damaged">{t('Defekt', 'Damaged')}</MenuItem>
                    </TextField>
                    <TextField
                        select
                        label={t('Zustand', 'Condition')}
                        value={singleInput.conditionStatus || 'good'}
                        onChange={(e) => updateSingle({ conditionStatus: e.target.value as any })}
                        fullWidth
                    >
                        <MenuItem value="new_condition">{t('Neu', 'New')}</MenuItem>
                        <MenuItem value="good">{t('Gut', 'Good')}</MenuItem>
                        <MenuItem value="fair">{t('Gebraucht', 'Fair')}</MenuItem>
                        <MenuItem value="damaged">{t('Beschädigt', 'Damaged')}</MenuItem>
                        <MenuItem value="unsafe">{t('Unsicher', 'Unsafe')}</MenuItem>
                    </TextField>
                    <TextField
                        select
                        label={t('Lagerort', 'Storage location')}
                        value={singleInput.currentLocationId || ''}
                        onChange={(e) => updateSingle({ currentLocationId: e.target.value })}
                        fullWidth
                    >
                        {storageLocations?.map((loc) => (
                            <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label={t('Betriebsstunden', 'Operating hours')}
                        type="number"
                        value={singleInput.operatingHours ?? ''}
                        onChange={(e) => updateSingle({ operatingHours: e.target.value ? Number(e.target.value) : undefined })}
                        fullWidth
                    />
                    <TextField
                        label={t('Notizen', 'Notes')}
                        multiline
                        rows={2}
                        value={singleInput.notes || ''}
                        onChange={(e) => updateSingle({ notes: e.target.value })}
                        fullWidth
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddSingleOpen(false)}>{t('Abbrechen', 'Cancel')}</Button>
                    <Button variant="contained" onClick={handleSaveSingle} disabled={createAsset.isPending}>
                        {t('Anlegen', 'Create')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Batch Generate Assets */}
            <Dialog open={batchOpen} onClose={() => setBatchOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('Assets stapelweise generieren', 'Batch Generate Assets')}</DialogTitle>
                <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        {t('Erzeugt mehrere fortlaufend nummerierte Einheiten auf einmal (z. B. für 50 Funkgeräte oder 5 Generatoren).', 'Creates multiple consecutively numbered units at once (e.g. for 50 walkie-talkies or 5 generators).')}
                    </Typography>
                    <TextField
                        label={t('Anzahl zu erstellender Assets', 'Number of assets to generate')}
                        type="number"
                        value={batchInput.batchCount}
                        onChange={(e) => setBatchInput((prev) => ({ ...prev, batchCount: Math.max(1, Number(e.target.value)) }))}
                        fullWidth
                        slotProps={{ htmlInput: { min: 1, max: 200 } }}
                    />
                    <TextField
                        label={t('Code-Präfix', 'Code prefix')}
                        value={batchInput.codePrefix}
                        onChange={(e) => setBatchInput((prev) => ({ ...prev, codePrefix: e.target.value }))}
                        fullWidth
                        helperText={t(`Vorschau: ${batchInput.codePrefix}${String(batchInput.startNumber).padStart(3, '0')}`, `Preview: ${batchInput.codePrefix}${String(batchInput.startNumber).padStart(3, '0')}`)}
                    />
                    <TextField
                        label={t('Startnummer', 'Start number')}
                        type="number"
                        value={batchInput.startNumber}
                        onChange={(e) => setBatchInput((prev) => ({ ...prev, startNumber: Math.max(1, Number(e.target.value)) }))}
                        fullWidth
                        slotProps={{ htmlInput: { min: 1 } }}
                    />
                    <TextField
                        select
                        label={t('Lagerort', 'Storage location')}
                        value={batchInput.currentLocationId || ''}
                        onChange={(e) => setBatchInput((prev) => ({ ...prev, currentLocationId: e.target.value }))}
                        fullWidth
                    >
                        {storageLocations?.map((loc) => (
                            <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                        ))}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBatchOpen(false)}>{t('Abbrechen', 'Cancel')}</Button>
                    <Button variant="contained" onClick={handleSaveBatch} disabled={createAsset.isPending}>
                        {t('Generieren', 'Generate')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Edit Asset */}
            <Dialog open={!!editAsset} onClose={() => setEditAsset(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('Asset bearbeiten', 'Edit Asset')}: {editAsset?.assetCode}</DialogTitle>
                <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label={t('Asset-Code', 'Asset code')}
                        value={editInput.assetCode || ''}
                        onChange={(e) => updateEdit({ assetCode: e.target.value })}
                        fullWidth
                    />
                    <TextField
                        label={t('Seriennummer', 'Serial number')}
                        value={editInput.serialNumber || ''}
                        onChange={(e) => updateEdit({ serialNumber: e.target.value })}
                        fullWidth
                    />
                    <TextField
                        select
                        label={t('Status', 'Status')}
                        value={editInput.availabilityStatus || 'available'}
                        onChange={(e) => updateEdit({ availabilityStatus: e.target.value as any })}
                        fullWidth
                    >
                        <MenuItem value="available">{t('Verfügbar', 'Available')}</MenuItem>
                        <MenuItem value="in_custody">{t('Ausgeliehen / Im Einsatz', 'In custody')}</MenuItem>
                        <MenuItem value="in_maintenance">{t('In Wartung', 'In maintenance')}</MenuItem>
                        <MenuItem value="in_repair">{t('In Reparatur', 'In repair')}</MenuItem>
                        <MenuItem value="damaged">{t('Defekt', 'Damaged')}</MenuItem>
                        <MenuItem value="written_off">{t('Ausgemustert', 'Written off')}</MenuItem>
                    </TextField>
                    <TextField
                        select
                        label={t('Zustand', 'Condition')}
                        value={editInput.conditionStatus || 'good'}
                        onChange={(e) => updateEdit({ conditionStatus: e.target.value as any })}
                        fullWidth
                    >
                        <MenuItem value="new_condition">{t('Neu', 'New')}</MenuItem>
                        <MenuItem value="good">{t('Gut', 'Good')}</MenuItem>
                        <MenuItem value="fair">{t('Gebraucht', 'Fair')}</MenuItem>
                        <MenuItem value="damaged">{t('Beschädigt', 'Damaged')}</MenuItem>
                        <MenuItem value="unsafe">{t('Unsicher', 'Unsafe')}</MenuItem>
                    </TextField>
                    <TextField
                        select
                        label={t('Lagerort', 'Storage location')}
                        value={editInput.currentLocationId || ''}
                        onChange={(e) => updateEdit({ currentLocationId: e.target.value })}
                        fullWidth
                    >
                        {storageLocations?.map((loc) => (
                            <MenuItem key={loc.id} value={loc.id}>{loc.name}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label={t('Betriebsstunden', 'Operating hours')}
                        type="number"
                        value={editInput.operatingHours ?? ''}
                        onChange={(e) => updateEdit({ operatingHours: e.target.value ? Number(e.target.value) : undefined })}
                        fullWidth
                    />
                    <TextField
                        label={t('Notizen', 'Notes')}
                        multiline
                        rows={2}
                        value={editInput.notes || ''}
                        onChange={(e) => updateEdit({ notes: e.target.value })}
                        fullWidth
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditAsset(null)}>{t('Abbrechen', 'Cancel')}</Button>
                    <Button variant="contained" onClick={handleSaveEdit} disabled={updateAsset.isPending}>
                        {t('Speichern', 'Save')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: QR Code Generator */}
            <Dialog open={!!qrAsset} onClose={() => setQrAsset(null)} maxWidth="xs" fullWidth>
                <DialogTitle>QR-Code: {qrAsset?.assetCode}</DialogTitle>
                <DialogContent>
                    {qrAsset && (
                        <QRCodeGenerator
                            itemId={item.id}
                            itemName={`${item.name} (${qrAsset.assetCode})`}
                            textCode={qrAsset.assetCode}
                        />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setQrAsset(null)}>{t('Schließen', 'Close')}</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={!!deleteTarget}
                title={t('Asset ausmustern', 'Retire Asset')}
                message={t(
                    `Möchten Sie das Einzelgerät ${deleteTarget?.assetCode} wirklich ausmustern?`,
                    `Are you sure you want to retire asset ${deleteTarget?.assetCode}?`
                )}
                actionLabel={t('Ausmustern', 'Retire')}
                actionTooltip={t('Asset als inaktiv markieren', 'Mark asset as inactive')}
                actionColor="error"
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirm}
                pending={deleteAsset.isPending}
            />
        </Paper>
    );
}
