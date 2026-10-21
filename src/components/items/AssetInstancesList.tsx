import { Button } from '../shared/ActionButtons';
import { RowActions, type RowAction } from '../shared/RowActions';
import { ActionBar } from '../shared/ActionBar';
import { useOverflowCollapse } from '../../hooks/useOverflowCollapse';
import { Dialog } from '../shared/ClosableDialog';
import { useState } from 'react';
import {
    Box,
    Typography,
    Stack,
    TextField,
    MenuItem,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    DialogTitle,
    DialogContent,
    DialogActions,
    CircularProgress,

    Card,
    CardContent,
    useTheme,
    useMediaQuery,
    Checkbox,
    Link,
    Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import AvTimerIcon from '@mui/icons-material/AvTimer';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Item, AssetInstance, AssetInstanceInput, AssetConditionStatus } from '../../types';
import { useItemAssets, useCreateItemAsset, useUpdateItemAsset, useDeleteItemAsset, useRecodeItemAssets, useWriteOffItemAssets } from '../../hooks/useItems';
import { useUIStore } from '../../store/uiStore';
import { downloadAssetLabelsPdf } from '../qr/assetLabelsPdf';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { translate, useT } from '../../utils/naming';
import { useClientPagination } from '../../hooks/useClientPagination';
import { QrLabelDialog } from '../qr/QrLabelDialog';
import { OperatingHoursDialog } from './OperatingHoursDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ListPagination } from '../shared/ListPagination';
import { formatStatus } from '../../utils/formatters';
import { LocationPicker } from '../shared/LocationPicker';
import { AssetDetailsFields, AssetEditFields } from './AssetDetailsFields';
import { assetEditInput } from './assetInput';

interface Props {
    item: Item;
    canEdit?: boolean;
    canReportDamage?: boolean;
}

const statusColorMap: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    available: 'success',
    in_custody: 'warning',
    in_field: 'warning',
    reserved: 'info',
    staged: 'info',
    in_maintenance: 'info',
    in_repair: 'warning',
    damaged: 'error',
    written_off: 'default',
};

export function AssetInstancesList({ item, canEdit = true, canReportDamage = true }: Props) {
    const t = useT();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const navigate = useNavigate();

    const { data: assets, isLoading, isError, refetch } = useItemAssets(item.id);
    const { data: storageLocations } = useStorageLocations();

    const createAsset = useCreateItemAsset(item.id);
    const updateAsset = useUpdateItemAsset(item.id);
    const deleteAsset = useDeleteItemAsset(item.id);
    const recodeAssets = useRecodeItemAssets(item.id);
    const writeOffAssets = useWriteOffItemAssets(item.id);
    const showSnackbar = useUIStore((state) => state.showSnackbar);
    const showError = (error: unknown) => showSnackbar(error instanceof Error ? error.message : t('items.assetInstancesList.actionFailed'), 'error');

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');

    const filteredAssets = (() => {
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
    })();
    const { pageItems: pageAssets, page: currentPage, setPage, pageSize, onPageSizeChange } = useClientPagination(filteredAssets);

    /** Reserved and staged units name the order that holds them. */
    function reservationNote(asset: AssetInstance, gridColumn?: string) {
        if (asset.availabilityStatus !== 'reserved' && asset.availabilityStatus !== 'staged') return null;
        const holder = asset.reservedFor;
        if (!holder) return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', gridColumn }}>{t('items.assetInstancesList.noOpenOrderFound')}</Typography>;
        if (!holder.orderId) return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', gridColumn }}>{t('items.assetInstancesList.reservedForAnOrderYouCannotView')}</Typography>;
        const to = holder.kind === 'faction_order' ? `/orders/faction/${holder.orderId}` : '/orders?tab=general';
        return <Typography variant="caption" color="text.secondary" sx={{ display: 'block', gridColumn }}>
            {t('items.assetInstancesList.forOrder')}{' '}
            <Link component={RouterLink} to={to} underline="hover">{holder.label}</Link>
        </Typography>;
    }
    function assetActions(asset: AssetInstance): RowAction[] {
        const assetPath = `/items/${item.id}/assets/${asset.id}`;
        return [
            { key: 'info', label: t('items.assetInstancesList.openAssetInfoPage'), icon: <InfoOutlinedIcon fontSize="small" />, onClick: () => navigate(assetPath) },
            ...(canReportDamage ? [{ key: 'damage', label: t('items.assetInstancesList.reportDamageToThisAsset'), icon: <ReportProblemOutlinedIcon fontSize="small" />, onClick: () => navigate(`${assetPath}?reportDamage=1`), color: 'error' as const }] : []),
            { key: 'qr', label: t('items.assetInstancesList.showQRCode'), icon: <QrCode2Icon fontSize="small" />, onClick: () => setQrAsset(asset) },
            ...(canEdit ? [
                ...(item.tracksRuntime ? [{ key: 'hours', label: t('items.assetInstancesList.logOperatingHours'), icon: <AvTimerIcon fontSize="small" />, onClick: () => setHoursAsset(asset) }] : []),
                { key: 'edit', label: t('common.edit'), icon: <EditIcon fontSize="small" />, onClick: () => handleOpenEdit(asset) },
                { key: 'retire', label: t('items.assetInstancesList.writeOffRetire'), icon: <DeleteIcon fontSize="small" />, onClick: () => setDeleteTarget(asset), color: 'error' as const },
            ] : []),
        ];
    }
    const { ref: tableRef, collapsed: actionsCollapsed } = useOverflowCollapse<HTMLDivElement>();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Dialogs
    const [addSingleOpen, setAddSingleOpen] = useState(false);
    const [recodeOpen, setRecodeOpen] = useState(false);
    const [writeOffOpen, setWriteOffOpen] = useState(false);
    const [printing, setPrinting] = useState(false);
    const [editAsset, setEditAsset] = useState<AssetInstance | null>(null);
    const [qrAsset, setQrAsset] = useState<AssetInstance | null>(null);
    const [hoursAsset, setHoursAsset] = useState<AssetInstance | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AssetInstance | null>(null);

    // Form states
    const emptySingle = (): AssetInstanceInput => ({
        assetCode: '',
        serialNumber: '',
        manufacturer: '',
        model: '',
        conditionStatus: 'good',
        currentLocationId: item.storageLocation ?? undefined,
        operatingHours: undefined,
        notes: '',
    });
    const [singleInput, setSingleInput] = useState<AssetInstanceInput>(emptySingle);
    const [recodeInput, setRecodeInput] = useState({ codePrefix: '', startNumber: '1' });
    const [editInput, setEditInput] = useState<AssetInstanceInput>({});

    /** Batch actions apply to the selected units, or to every unit when nothing is selected; always in code order. */
    const sortedAssets = [...(assets ?? [])].sort((a, b) => a.assetCode.localeCompare(b.assetCode, undefined, { numeric: true }));
    const selectedAssets = sortedAssets.filter((asset) => selectedIds.has(asset.id));
    const batchTargets = selectedAssets.length ? selectedAssets : sortedAssets;
    const recodeStart = Number(recodeInput.startNumber);
    const recodeValid = recodeInput.codePrefix.trim() !== '' && Number.isInteger(recodeStart) && recodeStart >= 1;
    const recodeCode = (offset: number) => `${recodeInput.codePrefix.trim().toLocaleUpperCase()}${String(recodeStart + offset).padStart(3, '0')}`;

    const updateSingle = (patch: Partial<AssetInstanceInput>) =>
        setSingleInput((prev: AssetInstanceInput) => ({ ...prev, ...patch }));
    const updateEdit = (patch: Partial<AssetInstanceInput>) =>
        setEditInput((prev: AssetInstanceInput) => ({ ...prev, ...patch }));

    function handleOpenAddSingle() {
        setSingleInput(emptySingle());
        setAddSingleOpen(true);
    }

    function handleOpenRecode() {
        setRecodeInput({ codePrefix: item.sku ? `${item.sku}-` : '', startNumber: '1' });
        setRecodeOpen(true);
    }

    function handleOpenEdit(asset: AssetInstance) {
        setEditAsset(asset);
        setEditInput(assetEditInput(asset, Boolean(item.tracksRuntime)));
    }

    function handleSaveSingle() {
        createAsset.mutate(singleInput, {
            onSuccess: () => setAddSingleOpen(false),
            onError: showError,
        });
    }

    function handleSaveRecode() {
        recodeAssets.mutate({
            codePrefix: recodeInput.codePrefix.trim(),
            startNumber: recodeStart,
            assetIds: batchTargets.map((asset) => asset.id),
        }, {
            onSuccess: () => { setRecodeOpen(false); setSelectedIds(new Set()); },
            onError: showError,
        });
    }

    function handleWriteOffSelected() {
        writeOffAssets.mutate(selectedAssets.map((asset) => asset.id), {
            onSuccess: () => { setWriteOffOpen(false); setSelectedIds(new Set()); },
            onError: showError,
        });
    }

    async function handlePrintLabels() {
        setPrinting(true);
        try {
            await downloadAssetLabelsPdf(item, batchTargets);
        } catch (error) {
            showError(error);
        } finally {
            setPrinting(false);
        }
    }

    function handleSaveEdit() {
        if (!editAsset) return;
        updateAsset.mutate({
            assetId: editAsset.id,
            input: editInput,
        }, {
            onSuccess: () => setEditAsset(null),
            onError: showError,
        });
    }

    function handleDeleteConfirm() {
        if (!deleteTarget) return;
        deleteAsset.mutate(deleteTarget.id, {
            onSuccess: () => setDeleteTarget(null),
            onError: showError,
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

    const pageAllSelected = pageAssets.length > 0 && pageAssets.every((asset) => selectedIds.has(asset.id));
    function togglePageSelection() {
        setSelectedIds((prev: Set<string>) => {
            const next = new Set(prev);
            for (const asset of pageAssets) {
                if (pageAllSelected) next.delete(asset.id);
                else next.add(asset.id);
            }
            return next;
        });
    }

    return (
        <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                    <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DynamicFeedIcon color="primary" fontSize="small" />
                        {t('items.assetInstancesList.serializedAssets')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('items.assetInstancesList.individuallyIdentifiedPhysicalUnitsWithDistinctStatusesQRCodesAnd')}
                    </Typography>
                </Box>
                <ActionBar size="small" sx={{ flex: '1 0 auto' }} actions={[
                    sortedAssets.length > 0 && { key: 'labels', label: t('items.assetInstancesList.qrLabelsPdf'), title: translate('items.assetInstancesList.qrLabelsPdfHelp'),
                        icon: <PictureAsPdfIcon />, disabled: printing, onClick: () => { void handlePrintLabels(); } },
                    canEdit && sortedAssets.length > 0 && { key: 'recode', label: t('items.assetInstancesList.assignCodes'), title: translate('items.assetInstancesList.assignCodesHelp'),
                        icon: <DynamicFeedIcon />, onClick: handleOpenRecode },
                    canEdit && { key: 'add', label: t('items.assetInstancesList.addAsset'), title: translate('items.assetInstancesList.registerASingleAsset'),
                        icon: <AddIcon />, variant: 'contained', pinned: true, onClick: handleOpenAddSingle },
                ]} />
            </Box>

            {selectedAssets.length > 0 && <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, p: 1, pl: 2, mb: 2 }}>
                <Typography sx={{ fontWeight: 600 }}>{t('items.assetInstancesList.selectedCountAssetsSelected', { selectedCount: String(selectedAssets.length) })}</Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                    <Button size="small" onClick={() => setSelectedIds(new Set())}>{t('items.assetInstancesList.clearSelection')}</Button>
                    {canEdit && <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setWriteOffOpen(true)}>
                        {t('items.assetInstancesList.writeOffSelected')}
                    </Button>}
                </Stack>
            </Paper>}

            {/* Toolbar / Search */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    placeholder={t('items.assetInstancesList.searchAssetIDSerialNumberCustodian')}
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    sx={{ flexGrow: 1, minWidth: 200 }}
                />
                <TextField
                    select
                    size="small"
                    label={t('items.assetInstancesList.filterStatus')}
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    sx={{ minWidth: 160 }}
                >
                    <MenuItem value="">{t('items.assetInstancesList.allStatuses')}</MenuItem>
                    <MenuItem value="available">{t('enum.itemStatus.available')}</MenuItem>
                    <MenuItem value="in_custody">{t('items.assetInstancesList.inCustody')}</MenuItem>
                    <MenuItem value="reserved">{t('enum.transactionType.reserved')}</MenuItem>
                    <MenuItem value="in_maintenance">{t('enum.value.in_maintenance')}</MenuItem>
                    <MenuItem value="in_repair">{t('enum.value.in_repair')}</MenuItem>
                    <MenuItem value="damaged">{t('items.assetInstancesList.damaged')}</MenuItem>
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
                        {t('items.assetInstancesList.noAssetInstancesRecordedForThisItem')}
                    </Typography>
                    {canEdit && <Button title={translate('items.assetInstancesList.registerTheFirstAssetForThisItem')}
                        size="small"
                        sx={{ mt: 1 }}
                        startIcon={<AddIcon />}
                        onClick={handleOpenAddSingle}
                    >
                        {t('items.assetInstancesList.registerFirstAsset')}
                    </Button>}
                </Box>
            ) : isMobile ? (
                <Stack spacing={1.5}>
                    {pageAssets.map((asset) => (
                        <Card key={asset.id} variant="outlined">
                            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                                    <Checkbox size="small" sx={{ m: -1, mr: 0 }} checked={selectedIds.has(asset.id)} onChange={() => toggleSelect(asset.id)}
                                        slotProps={{ input: { 'aria-label': t('items.assetInstancesList.selectAssetCode', { assetCode: asset.assetCode }) } }} />
                                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        <Link component={RouterLink} to={`/items/${item.id}/assets/${asset.id}`} underline="hover"
                                            sx={{ fontWeight: 700, fontSize: '1rem', display: 'block', overflowWrap: 'anywhere' }} title={t('items.assetInstancesList.openAssetInfoPage')}>
                                            {asset.assetCode}
                                        </Link>
                                        {asset.serialNumber && (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                S/N: {asset.serialNumber}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={formatStatus(asset.availabilityStatus)}
                                        color={statusColorMap[asset.availabilityStatus] || 'default'}
                                        sx={{ flexShrink: 0 }}
                                    />
                                </Box>
                                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, fontSize: '0.8rem', color: 'text.secondary', mb: 1 }}>
                                    <div>{t('items.assetInstancesList.condition')}: <strong>{formatStatus(asset.conditionStatus)}</strong></div>
                                    <div>{t('enum.value.location')}: <strong>{asset.currentLocationCode || asset.currentLocationName || '—'}</strong></div>
                                    {item.tracksRuntime && (
                                        <div>{t('items.assetInstancesList.hours')}: <strong>{asset.operatingHours ?? 0} h</strong></div>
                                    )}
                                    {asset.currentCustodianName && (
                                        <div>{t('items.assetInstancesList.custodian')}: <strong>{asset.currentCustodianName}</strong></div>
                                    )}
                                    {reservationNote(asset, '1 / -1')}
                                </Box>
                                <RowActions actions={assetActions(asset)} />
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            ) : (
                <TableContainer ref={tableRef}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell padding="checkbox">
                                    <Checkbox size="small" checked={pageAllSelected} indeterminate={!pageAllSelected && pageAssets.some((asset) => selectedIds.has(asset.id))}
                                        onChange={togglePageSelection} slotProps={{ input: { 'aria-label': t('items.assetInstancesList.selectAllOnPage') } }} />
                                </TableCell>
                                <TableCell><strong>{t('items.assetInstancesList.assetCodeID')}</strong></TableCell>
                                <TableCell><strong>{t('items.assetInstancesList.serialNumber')}</strong></TableCell>
                                <TableCell><strong>{t('common.status')}</strong></TableCell>
                                <TableCell><strong>{t('items.assetInstancesList.condition')}</strong></TableCell>
                                <TableCell><strong>{t('enum.value.location')}</strong></TableCell>
                                {item.tracksRuntime && <TableCell><strong>{t('items.assetInstancesList.operatingHours')}</strong></TableCell>}
                                <TableCell><strong>{t('items.assetInstancesList.custodian2')}</strong></TableCell>
                                <TableCell align="right"><strong>{t('common.actions')}</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pageAssets.map((asset) => (
                                <TableRow key={asset.id} hover selected={selectedIds.has(asset.id)}>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            size="small"
                                            checked={selectedIds.has(asset.id)}
                                            onChange={() => toggleSelect(asset.id)}
                                            slotProps={{ input: { 'aria-label': t('items.assetInstancesList.selectAssetCode', { assetCode: asset.assetCode }) } }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>
                                        <Link component={RouterLink} to={`/items/${item.id}/assets/${asset.id}`} underline="hover" title={t('items.assetInstancesList.openAssetInfoPage')}>
                                            {asset.assetCode}
                                        </Link>
                                    </TableCell>
                                    <TableCell>{asset.serialNumber || '—'}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={formatStatus(asset.availabilityStatus)}
                                            color={statusColorMap[asset.availabilityStatus] || 'default'}
                                        />
                                        {reservationNote(asset)}
                                    </TableCell>
                                    <TableCell>{formatStatus(asset.conditionStatus)}</TableCell>
                                    <TableCell title={asset.currentLocationName}>{asset.currentLocationCode || asset.currentLocationName || '—'}</TableCell>
                                    {item.tracksRuntime && <TableCell>
                                        {canEdit ? <Link component="button" type="button" underline="hover" onClick={() => setHoursAsset(asset)}
                                            title={t('items.assetInstancesList.logOperatingHours')}>
                                            {`${asset.operatingHours ?? 0} h`}
                                        </Link> : `${asset.operatingHours ?? 0} h`}
                                    </TableCell>}
                                    <TableCell>{asset.currentCustodianName || '—'}</TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                        <RowActions actions={assetActions(asset)} collapsed={actionsCollapsed} />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <ListPagination pageSize={pageSize} onPageSizeChange={onPageSizeChange} count={filteredAssets.length} page={currentPage} onChange={setPage}
                loadingMore={false} loadError={isError} onRetry={() => { void refetch(); }} />

            {/* Dialog: Add Single Asset */}
            <Dialog open={addSingleOpen} onClose={() => setAddSingleOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('items.assetInstancesList.addSingleAsset')}</DialogTitle>
                <DialogContent sx={{ pt: '24px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label={t('items.assetInstancesList.assetCodeID2')}
                        value={singleInput.assetCode || ''}
                        onChange={(e) => updateSingle({ assetCode: e.target.value })}
                        fullWidth
                        helperText={t('items.assetInstancesList.eGGEN001WT001AutoGeneratedIfEmpty')}
                    />
                    <TextField
                        label={t('items.assetInstancesList.manufacturerSerialNumber')}
                        value={singleInput.serialNumber || ''}
                        onChange={(e) => updateSingle({ serialNumber: e.target.value })}
                        fullWidth
                    />
                    <TextField
                        select
                        label={t('items.assetInstancesList.condition')}
                        value={singleInput.conditionStatus || 'good'}
                        onChange={(e) => updateSingle({ conditionStatus: e.target.value as AssetConditionStatus })}
                        fullWidth
                    >
                        <MenuItem value="new_condition">{t('items.assetInstancesList.new')}</MenuItem>
                        <MenuItem value="good">{t('enum.value.good')}</MenuItem>
                        <MenuItem value="fair">{t('items.assetInstancesList.fair')}</MenuItem>
                        <MenuItem value="damaged">{t('enum.itemStatus.damaged')}</MenuItem>
                        <MenuItem value="unsafe">{t('enum.value.unsafe')}</MenuItem>
                    </TextField>
                    <LocationPicker locations={storageLocations ?? []} value={singleInput.currentLocationId} label={t('common.storageLocation')}
                        onChange={(location) => updateSingle({ currentLocationId: location?.id })} />
                    <AssetDetailsFields value={singleInput} onChange={updateSingle} />
                    {item.tracksRuntime && <TextField
                        label={t('enum.value.operating_hours')}
                        type="number"
                        value={singleInput.operatingHours ?? ''}
                        onChange={(e) => updateSingle({ operatingHours: e.target.value ? Number(e.target.value) : undefined })}
                        fullWidth
                        slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }}
                    />}
                    <TextField
                        label={t('items.assetInstancesList.notes')}
                        multiline
                        rows={2}
                        value={singleInput.notes || ''}
                        onChange={(e) => updateSingle({ notes: e.target.value })}
                        fullWidth
                    />
                </DialogContent>
                <DialogActions>
                    <Button title={translate('common.discardChangesAndClose')} onClick={() => setAddSingleOpen(false)}>{t('common.cancel')}</Button>
                    <Button title={translate('items.assetInstancesList.saveTheNewAsset')} variant="contained" onClick={handleSaveSingle} disabled={createAsset.isPending}>
                        {t('items.assetInstancesList.create')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Assign codes to existing units */}
            <Dialog open={recodeOpen} onClose={() => setRecodeOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('items.assetInstancesList.assignAssetCodes')}</DialogTitle>
                <DialogContent sx={{ pt: '24px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        {selectedAssets.length
                            ? t('items.assetInstancesList.renamesTheCountSelectedUnits', { unitCount: String(batchTargets.length) })
                            : t('items.assetInstancesList.renamesAllCountUnits', { unitCount: String(batchTargets.length) })}
                    </Typography>
                    <TextField
                        label={t('items.assetInstancesList.codePrefix')}
                        value={recodeInput.codePrefix}
                        onChange={(e) => setRecodeInput((prev) => ({ ...prev, codePrefix: e.target.value }))}
                        required
                        fullWidth
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                    />
                    <TextField
                        label={t('items.assetInstancesList.startNumber')}
                        type="number"
                        value={recodeInput.startNumber}
                        onChange={(e) => setRecodeInput((prev) => ({ ...prev, startNumber: e.target.value }))}
                        required
                        fullWidth
                        error={recodeInput.startNumber !== '' && !(Number.isInteger(recodeStart) && recodeStart >= 1)}
                        helperText={recodeValid && batchTargets.length > 0
                            ? t('items.assetInstancesList.recodePreview', {
                                from: `${batchTargets[0].assetCode} → ${recodeCode(0)}`,
                                to: batchTargets.length > 1 ? ` … ${batchTargets[batchTargets.length - 1].assetCode} → ${recodeCode(batchTargets.length - 1)}` : '',
                            })
                            : undefined}
                        slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button title={translate('common.discardChangesAndClose')} onClick={() => setRecodeOpen(false)}>{t('common.cancel')}</Button>
                    <Button title={translate('items.assetInstancesList.assignCodesHelp')} variant="contained" onClick={handleSaveRecode} disabled={!recodeValid || recodeAssets.isPending}>
                        {t('items.assetInstancesList.assignCodes')}
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={writeOffOpen}
                title={t('items.assetInstancesList.writeOffSelectedAssets')}
                message={t('items.assetInstancesList.writeOffSelectedMessage', {
                    unitCount: String(selectedAssets.length),
                    codes: selectedAssets.slice(0, 10).map((asset) => asset.assetCode).join(', ') + (selectedAssets.length > 10 ? ', …' : ''),
                })}
                actionLabel={t('items.assetInstancesList.writeOff')}
                actionTooltip={t('items.assetInstancesList.permanentlyWriteOffAsset')}
                actionColor="error"
                onClose={() => setWriteOffOpen(false)}
                onConfirm={handleWriteOffSelected}
                pending={writeOffAssets.isPending}
            />

            {/* Dialog: Edit Asset */}
            <Dialog open={!!editAsset} onClose={() => setEditAsset(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('items.assetInstancesList.editAsset')}: {editAsset?.assetCode}</DialogTitle>
                <DialogContent sx={{ pt: '24px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <AssetEditFields value={editInput} tracksRuntime={Boolean(item.tracksRuntime)} onChange={updateEdit} />
                </DialogContent>
                <DialogActions>
                    <Button title={translate('common.discardChangesAndClose')} onClick={() => setEditAsset(null)}>{t('common.cancel')}</Button>
                    <Button title={translate('items.assetInstancesList.saveChangesToThisAsset')} variant="contained" onClick={handleSaveEdit} disabled={updateAsset.isPending}>
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            <OperatingHoursDialog itemId={item.id} asset={hoursAsset} onClose={() => setHoursAsset(null)} />

            <QrLabelDialog
                label={qrAsset ? { title: `QR-Code: ${qrAsset.assetCode}`, itemId: item.id, itemName: `${item.name} (${qrAsset.assetCode})`, textCode: qrAsset.assetCode } : null}
                onClose={() => setQrAsset(null)} />

            {/* Delete / Retire Confirmation */}
            <ConfirmDialog
                open={!!deleteTarget}
                title={t('items.assetInstancesList.retireWriteOffAsset')}
                message={t('items.assetInstancesList.areYouSureYouWantToRetireAssetAssetCodeThe', { assetCode: String(deleteTarget?.assetCode) })}
                actionLabel={t('items.assetInstancesList.writeOff')}
                actionTooltip={t('items.assetInstancesList.permanentlyWriteOffAsset')}
                actionColor="error"
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirm}
                pending={deleteAsset.isPending}
            />
        </Box>
    );
}
