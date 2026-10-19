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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import AvTimerIcon from '@mui/icons-material/AvTimer';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import type { Item, AssetInstance, AssetInstanceInput, AssetConditionStatus, AssetAvailabilityStatus } from '../../types';
import { useItemAssets, useCreateItemAsset, useUpdateItemAsset, useDeleteItemAsset } from '../../hooks/useItems';
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
                { key: 'hours', label: t('items.assetInstancesList.logOperatingHours'), icon: <AvTimerIcon fontSize="small" />, onClick: () => setHoursAsset(asset) },
                { key: 'edit', label: t('common.edit'), icon: <EditIcon fontSize="small" />, onClick: () => handleOpenEdit(asset) },
                { key: 'retire', label: t('items.assetInstancesList.writeOffRetire'), icon: <DeleteIcon fontSize="small" />, onClick: () => setDeleteTarget(asset), color: 'error' as const },
            ] : []),
        ];
    }
    const { ref: tableRef, collapsed: actionsCollapsed } = useOverflowCollapse<HTMLDivElement>();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Dialogs
    const [addSingleOpen, setAddSingleOpen] = useState(false);
    const [batchOpen, setBatchOpen] = useState(false);
    const [editAsset, setEditAsset] = useState<AssetInstance | null>(null);
    const [qrAsset, setQrAsset] = useState<AssetInstance | null>(null);
    const [hoursAsset, setHoursAsset] = useState<AssetInstance | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AssetInstance | null>(null);

    // Form states
    const [singleInput, setSingleInput] = useState<AssetInstanceInput>({
        assetCode: '',
        serialNumber: '',
        manufacturer: '',
        model: '',
        conditionStatus: 'good',
        availabilityStatus: 'available',
        currentLocationId: item.storageLocation ?? undefined,
        operatingHours: undefined,
        notes: '',
    });

    const [batchInput, setBatchInput] = useState<{
        batchCount: number;
        codePrefix: string;
        startNumber: number;
        conditionStatus: AssetConditionStatus;
        availabilityStatus: AssetAvailabilityStatus;
        currentLocationId?: string;
    }>({
        batchCount: 5,
        codePrefix: item.sku ? `${item.sku}-` : 'ASSET-',
        startNumber: 1,
        conditionStatus: 'good',
        availabilityStatus: 'available',
        currentLocationId: item.storageLocation ?? undefined,
    });

    const [editInput, setEditInput] = useState<AssetInstanceInput>({});

    const updateSingle = (patch: Partial<AssetInstanceInput>) =>
        setSingleInput((prev: AssetInstanceInput) => ({ ...prev, ...patch }));
    const updateEdit = (patch: Partial<AssetInstanceInput>) =>
        setEditInput((prev: AssetInstanceInput) => ({ ...prev, ...patch }));

    function handleOpenAddSingle() {
        const nextNum = (assets?.length ?? 0) + 1;
        setSingleInput({
            assetCode: item.sku ? `${item.sku}-${String(nextNum).padStart(3, '0')}` : '',
            serialNumber: '',
            manufacturer: '',
            model: '',
            conditionStatus: 'good',
            availabilityStatus: 'available',
            currentLocationId: item.storageLocation ?? undefined,
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
            currentLocationId: item.storageLocation ?? undefined,
        });
        setBatchOpen(true);
    }

    function handleOpenEdit(asset: AssetInstance) {
        setEditAsset(asset);
        setEditInput(assetEditInput(asset));
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
            conditionStatus: batchInput.conditionStatus,
            availabilityStatus: batchInput.availabilityStatus,
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
                {canEdit && <ActionBar size="small" sx={{ flex: '1 0 auto' }} actions={[
                    { key: 'batch', label: t('items.assetInstancesList.batchGenerate'), title: translate('items.assetInstancesList.createSeveralAssetsAtOnce'),
                        icon: <DynamicFeedIcon />, onClick: handleOpenBatch },
                    { key: 'add', label: t('items.assetInstancesList.addAsset'), title: translate('items.assetInstancesList.registerASingleAsset'),
                        icon: <AddIcon />, variant: 'contained', pinned: true, onClick: handleOpenAddSingle },
                ]} />}
            </Box>

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
                                    <Box sx={{ minWidth: 0 }}>
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
                                    {asset.operatingHours != null && (
                                        <div>{t('items.assetInstancesList.hours')}: <strong>{asset.operatingHours} h</strong></div>
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
                                {canEdit && <TableCell sx={{ width: 40 }} />}
                                <TableCell><strong>{t('items.assetInstancesList.assetCodeID')}</strong></TableCell>
                                <TableCell><strong>{t('items.assetInstancesList.serialNumber')}</strong></TableCell>
                                <TableCell><strong>{t('common.status')}</strong></TableCell>
                                <TableCell><strong>{t('items.assetInstancesList.condition')}</strong></TableCell>
                                <TableCell><strong>{t('enum.value.location')}</strong></TableCell>
                                <TableCell><strong>{t('items.assetInstancesList.operatingHours')}</strong></TableCell>
                                <TableCell><strong>{t('items.assetInstancesList.custodian2')}</strong></TableCell>
                                <TableCell align="right"><strong>{t('common.actions')}</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pageAssets.map((asset) => (
                                <TableRow key={asset.id} hover selected={selectedIds.has(asset.id)}>
                                    {canEdit && <TableCell padding="checkbox">
                                        <Checkbox
                                            size="small"
                                            checked={selectedIds.has(asset.id)}
                                            onChange={() => toggleSelect(asset.id)}
                                        />
                                    </TableCell>}
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
                                    <TableCell>
                                        {canEdit ? <Link component="button" type="button" underline="hover" onClick={() => setHoursAsset(asset)}
                                            title={t('items.assetInstancesList.logOperatingHours')}>
                                            {`${asset.operatingHours ?? 0} h`}
                                        </Link> : asset.operatingHours != null ? `${asset.operatingHours} h` : '—'}
                                    </TableCell>
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
                        label={t('common.status')}
                        value={singleInput.availabilityStatus || 'available'}
                        onChange={(e) => updateSingle({ availabilityStatus: e.target.value as AssetAvailabilityStatus })}
                        fullWidth
                    >
                        <MenuItem value="available">{t('enum.itemStatus.available')}</MenuItem>
                        <MenuItem value="in_custody">{t('items.assetInstancesList.inCustody')}</MenuItem>
                        <MenuItem value="in_maintenance">{t('enum.value.in_maintenance')}</MenuItem>
                        <MenuItem value="in_repair">{t('enum.value.in_repair')}</MenuItem>
                        <MenuItem value="damaged">{t('items.assetInstancesList.damaged')}</MenuItem>
                    </TextField>
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
                    <TextField
                        label={t('enum.value.operating_hours')}
                        type="number"
                        value={singleInput.operatingHours ?? ''}
                        onChange={(e) => updateSingle({ operatingHours: e.target.value ? Number(e.target.value) : undefined })}
                        fullWidth
                    />
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

            {/* Dialog: Batch Generate Assets */}
            <Dialog open={batchOpen} onClose={() => setBatchOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('items.assetInstancesList.batchGenerateAssets')}</DialogTitle>
                <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        {t('items.assetInstancesList.createsMultipleConsecutivelyNumberedUnitsAtOnceEGFor')}
                    </Typography>
                    <TextField
                        label={t('items.assetInstancesList.numberOfAssetsToGenerate')}
                        type="number"
                        value={batchInput.batchCount}
                        onChange={(e) => setBatchInput((prev) => ({ ...prev, batchCount: Math.max(1, Number(e.target.value)) }))}
                        fullWidth
                        slotProps={{ htmlInput: { min: 1, max: 200 } }}
                    />
                    <TextField
                        label={t('items.assetInstancesList.codePrefix')}
                        value={batchInput.codePrefix}
                        onChange={(e) => setBatchInput((prev) => ({ ...prev, codePrefix: e.target.value }))}
                        fullWidth
                        helperText={t('items.assetInstancesList.previewCodePrefixStartNumber', { codePrefix: String(batchInput.codePrefix), startNumber: String(String(batchInput.startNumber).padStart(3, '0')) })}
                    />
                    <TextField
                        label={t('items.assetInstancesList.startNumber')}
                        type="number"
                        value={batchInput.startNumber}
                        onChange={(e) => setBatchInput((prev) => ({ ...prev, startNumber: Math.max(1, Number(e.target.value)) }))}
                        fullWidth
                        slotProps={{ htmlInput: { min: 1 } }}
                    />
                    <LocationPicker locations={storageLocations ?? []} value={batchInput.currentLocationId} label={t('common.storageLocation')}
                        onChange={(location) => setBatchInput((prev) => ({ ...prev, currentLocationId: location?.id }))} />
                </DialogContent>
                <DialogActions>
                    <Button title={translate('common.discardChangesAndClose')} onClick={() => setBatchOpen(false)}>{t('common.cancel')}</Button>
                    <Button title={translate('items.assetInstancesList.generateAssetsUsingTheEnteredDetails')} variant="contained" onClick={handleSaveBatch} disabled={createAsset.isPending}>
                        {t('items.assetInstancesList.generate')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Dialog: Edit Asset */}
            <Dialog open={!!editAsset} onClose={() => setEditAsset(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('items.assetInstancesList.editAsset')}: {editAsset?.assetCode}</DialogTitle>
                <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <AssetEditFields value={editInput} onChange={updateEdit} />
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
