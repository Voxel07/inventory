import { formatDate } from '../utils/dateFormat';
import { formatMoney } from '../utils/money';
import { ActionBar } from '../components/shared/ActionBar';
import { MediaImage } from '../components/common/MediaImage';
import { apiFileUrl } from '../services/apiClient';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    ButtonBase,
    Typography,
    Chip,
    DialogContent,
    DialogTitle,
    Skeleton,
    Alert,
    Stack,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Dialog } from '../components/shared/ClosableDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { StatStrip } from '../components/shared/StatStrip';
import { DetailSection } from '../components/items/DetailSection';
import { Field, FieldGrid } from '../components/items/CompactDetail';
import { useCompactCatalog } from '../hooks/useCompactCatalog';
import { TooltipButton } from '../components/shared/TooltipButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import ShoppingCartCheckoutIcon from '@mui/icons-material/ShoppingCartCheckout';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { useAssembly, useUpdateAssembly } from '../hooks/useAssemblies';
import { useItemsByIds } from '../hooks/useItems';
import { ItemAutocomplete } from '../components/shared/ItemAutocomplete';
import { AssemblyCheckoutForm } from '../components/forms/AssemblyCheckoutForm';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { FormDialog } from '../components/shared/FormDialog';
import { DamageReportDialog } from '../components/forms/DamageReportDialog';
import { useUIStore } from '../store/uiStore';
import type { AssemblyFormData, Item } from '../types';
import { fromSteps, getItemStock } from '../utils/stock';
import { ItemsList } from '../components/lists/ItemsList';
import { useT } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canCheckoutItem, canEditCatalog, canOperateWarehouse } from '../utils/access';
import { InventorySharing } from '../components/items/InventorySharing';

export function AssemblyDetail() {
    const { user } = useAuth();
    const canTransact = canOperateWarehouse(user);

    const t = useT();
    const { assemblyId } = useParams<{ assemblyId: string }>();
    const navigate = useNavigate();
    const { data: assembly, isLoading } = useAssembly(assemblyId ?? '');
    const canEdit = assembly?.access?.privateResource ? assembly.access.canEdit : canEditCatalog(user);
    // Exactly this assembly's components, never the catalog.
    const itemsQuery = useItemsByIds([...(assembly?.itemIds ?? []), ...Object.keys(assembly?.itemQuantities ?? {})]);
    const items = itemsQuery.data;
    const updateAssembly = useUpdateAssembly();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [editOpen, setEditOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [damageOpen, setDamageOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [imageOpen, setImageOpen] = useState(false);
    const compact = useCompactCatalog();
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    function handleUpdate(data: AssemblyFormData) {
        if (!assembly) return;
        updateAssembly.mutate(
            { id: assembly.id, data },
            {
                onSuccess: () => {
                    setEditOpen(false);
                    showSnackbar(t('pages.assemblyDetail.assemblyUpdated'), 'success');
                },
                onError: () => showSnackbar(t('pages.assemblyDetail.couldNotUpdateAssembly'), 'error'),
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
                onSuccess: () => showSnackbar(t('pages.assemblyDetail.itemAddedToAssembly'), 'success'),
                onError: () => showSnackbar(t('pages.assemblyDetail.couldNotAddItem'), 'error'),
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
                onSuccess: () => showSnackbar(t('pages.assemblyDetail.itemRemovedFromAssembly'), 'success'),
                onError: () => showSnackbar(t('pages.assemblyDetail.couldNotRemoveItem'), 'error'),
            }
        );
    }

    const currentItems = new Map((items ?? []).map(item => [item.id, item]));
    const assemblyItems: Item[] = [...new Set([...(assembly?.itemIds ?? []), ...Object.keys(assembly?.itemQuantities ?? {})])]
        .map(id => currentItems.get(id))
        .filter((item): item is Item => Boolean(item));
    const stockInfo = new Map(assemblyItems.map(item => [item.id, getItemStock(item).remaining]));

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
                    tooltipText={t('pages.assemblyDetail.backToAssemblies')}
                    icon={<ArrowBackIcon />}
                    label={t('pages.assemblyDetail.backToAssemblies2')}
                    variant="text"
                    onClick={() => navigate('/assemblies')}
                />
                <Typography variant="h5" sx={{ mt: 2 }}>
                    {t('pages.assemblyDetail.assemblyNotFound')}
                </Typography>
            </Box>
        );
    }

    const totalValue = assemblyItems.reduce(
        (sum, item) => sum + (item.value ?? 0) * fromSteps(item, assembly.itemQuantities?.[item.id] ?? 1), 0,
    );

    // Check which items have insufficient stock
    const insufficientItems = assemblyItems.filter((item) => {
        const needed = assembly.itemQuantities?.[item.id] ?? 1;
        const available = stockInfo.get(item.id) ?? 0;
        return available < needed;
    });

    const componentsReady = assemblyItems.length === new Set([...(assembly.itemIds ?? []), ...Object.keys(assembly.itemQuantities ?? {})]).size;
    const maxAssembliesPossible = assemblyItems.length ? Math.min(...assemblyItems.map(item => Math.floor((stockInfo.get(item.id) ?? 0) / (assembly.itemQuantities[item.id] ?? 1)))) : 0;
    const canCheckout = componentsReady && insufficientItems.length === 0 && assemblyItems.length > 0;

    const available = componentsReady ? maxAssembliesPossible : null;

    return (
        <Box>
            <PageHeader title={assembly.name} back={{ label: t('pages.assemblyDetail.backToAssemblies'), to: '/assemblies' }} inlineActions={compact}
                actions={<ActionBar collapsed={compact ? true : undefined} actions={[
                    canEdit && compact && { key: 'add', label: t('pages.assemblyDetail.addItem'), icon: <AddIcon />, onClick: () => setAddOpen(true) },
                    canEdit && { key: 'edit', label: t('common.edit'), title: t('pages.assemblyDetail.editAssemblyDetails'), icon: <EditIcon />, onClick: () => setEditOpen(true) },
                    canTransact && { key: 'damage', label: t('common.reportDamage'), title: t('pages.assemblyDetail.reportDamageToThisAssembly'), icon: <ReportProblemOutlinedIcon />,
                        color: 'error', onClick: () => setDamageOpen(true) },
                    assemblyItems.every(item => canCheckoutItem(user, item)) && { key: 'checkout', label: t('enum.action.checkout'), title: t('pages.assemblyDetail.checkOutAllItemsInThisAssembly'), icon: <ShoppingCartCheckoutIcon />,
                        variant: 'contained', pinned: true, disabled: !canCheckout, onClick: () => setCheckoutOpen(true) },
                ]} />} />

            {/* The image is a thumbnail that opens full size, so the components stay near the top on phones. */}
            <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'stretch' }}>
                {assembly.image && <ButtonBase onClick={() => setImageOpen(true)} aria-label={t('pages.assemblyDetail.showImage')}
                    sx={{ flexShrink: 0, borderRadius: 1, border: 1, borderColor: 'divider', overflow: 'hidden', bgcolor: 'background.paper' }}>
                    <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name}
                        sx={{ display: 'block', width: { xs: 64, md: 112 }, height: { xs: 64, md: 112 }, objectFit: 'contain' }} />
                </ButtonBase>}
                <StatStrip sx={{ flex: 1, minWidth: 0, alignSelf: 'center' }} stats={[
                    { label: t('pages.assemblyDetail.components'), value: assemblyItems.length },
                    { label: t('enum.itemStatus.available'), value: available ?? '…', color: available ? 'success.main' : undefined },
                    { label: t('pages.assemblyDetail.totalValue'), value: formatMoney(totalValue) },
                ]} />
            </Stack>

            {assembly.hint && (
                <Alert severity="info" sx={{ mb: 2, py: 0.5, alignItems: 'flex-start', '& .MuiAlert-icon': { py: 0.75 } }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{t('pages.assemblyDetail.assemblyInstruction')}</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{assembly.hint}</Typography>
                </Alert>
            )}

            {insufficientItems.length > 0 && (
                <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
                    {phone ? t('pages.assemblyDetail.insufficientStockCount', { count: insufficientItems.length }) : <>
                        {t('pages.assemblyDetail.insufficientStockFor')}: {insufficientItems.map((i) => {
                            const needed = assembly.itemQuantities?.[i.id] ?? 1;
                            const available = stockInfo.get(i.id) ?? 0;
                            return t('pages.assemblyDetail.nameNeededNeededAvailableAvailable', { name: String(i.name), needed: needed, available: available });
                        }).join(', ')}
                    </>}
                </Alert>
            )}

            <Box sx={{ mb: 2 }}>
                <DetailSection title={t('common.details')} defaultExpanded={false}>
                    <Stack spacing={1.5}>
                        <FieldGrid>
                            <Field label={t('common.category')}>{[assembly.category, assembly.subcategory].filter(Boolean).join(' · ') || '—'}</Field>
                            <Field label={t('pages.assemblyDetail.created')}>{formatDate(assembly.created)}</Field>
                            <Field wide label={t('pages.assemblyDetail.eventUse')}>
                                {assembly.eventTypes?.length ? <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                    {assembly.eventTypes.map((eventType) => (
                                        <Chip key={eventType} label={eventType === 'LS' ? 'LightSim' : eventType} color="primary" variant="outlined" size="small" />
                                    ))}
                                </Stack> : t('pages.assemblyDetail.notAssignedToAnEvent')}
                            </Field>
                            {assembly.description && <Field wide label={t('common.description')}>
                                <Box component="span" sx={{ whiteSpace: 'pre-wrap', fontWeight: 400 }}>{assembly.description}</Box>
                            </Field>}
                        </FieldGrid>
                        <InventorySharing kind="assemblies" id={assembly.id} access={assembly.access} />
                    </Stack>
                </DetailSection>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h6">
                    {t('pages.assemblyDetail.itemsInThisAssembly')}
                </Typography>
                {canEdit && !compact && <Box sx={{ minWidth: 250, maxWidth: 350, flex: 1 }}>
                    <ItemAutocomplete size="small" label={t('pages.assemblyDetail.quicklyAddItem')} value={null}
                        filter={(item) => !(assembly.itemIds ?? []).includes(item.id)}
                        onChange={(newItem) => { if (newItem) handleAddItem(newItem.id); }} />
                </Box>}
            </Box>

            <ItemsList items={assemblyItems} isLoading={itemsQuery.isLoading && !assemblyItems.length}
                requiredQuantities={assembly.itemQuantities} onRemoveItem={canEdit ? handleRemoveItem : undefined}
                loadingMore={false} loadError={itemsQuery.isError} searchFrom={10}
                onRetry={() => { void itemsQuery.refetch(); }} />

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{t('pages.assemblyDetail.addItem')}</DialogTitle>
                <DialogContent sx={{ pt: '8px !important' }}>
                    <ItemAutocomplete label={t('pages.assemblyDetail.quicklyAddItem')} value={null}
                        filter={(item) => !(assembly.itemIds ?? []).includes(item.id)}
                        onChange={(newItem) => { if (newItem) { handleAddItem(newItem.id); setAddOpen(false); } }} />
                </DialogContent>
            </Dialog>

            {assembly.image && <Dialog open={imageOpen} onClose={() => setImageOpen(false)} maxWidth="md" fullWidth>
                <DialogContent sx={{ p: 1 }}>
                    <MediaImage src={apiFileUrl(assembly.image)} alt={assembly.name}
                        sx={{ display: 'block', width: '100%', maxHeight: '80dvh', objectFit: 'contain' }} />
                </DialogContent>
            </Dialog>}

            {checkoutOpen && <AssemblyCheckoutForm assembly={assembly} items={assemblyItems} onClose={() => setCheckoutOpen(false)} />}

            {/* Edit Dialog */}
            <FormDialog open={editOpen} onClose={() => setEditOpen(false)}>
                <AssemblyForm
                    title={t('pages.assemblyDetail.editAssembly')}
                    onCancel={() => setEditOpen(false)}
                    initialData={assembly}
                    onSubmit={handleUpdate}
                    isLoading={updateAssembly.isPending}
                />
            </FormDialog>
            <DamageReportDialog
                key={assembly.id}
                open={damageOpen}
                onClose={() => setDamageOpen(false)}
                title={t('pages.assemblyDetail.reportDamageToName', { name: String(assembly.name) })}
                assemblies={[assembly]}
                preselectedAssemblyId={assembly.id}
            />
        </Box>
    );
}
