import { useCompleteList } from '../../hooks/usePagedList';
import { useStockLookups } from '../../hooks/useStockLookups';
import { operationsApi } from '../../services/operationsService';
import { QueryFeedback } from '../common/QueryFeedback';
import { formatQuantity, usesPercentage } from '../../utils/stock';
import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Autocomplete, Box, Chip, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { ItemAutocomplete } from '../shared/ItemAutocomplete';
import type { Assembly, AssetInstance, DamageReportFormData, DamageSeverity, Item } from '../../types';
import { useItemAssets, useItemsByIds } from '../../hooks/useItems';
import { translate, nameFor, useAppLanguage, useT } from '../../utils/naming';
import { SEVERITY_LEVELS } from '../../utils/constants';

export interface DamageReportFormProps {
    assemblies?: Assembly[];
    preselectedItemId?: string;
    preselectedAssetId?: string;
    preselectedAssemblyId?: string;
    preselectedAsset?: AssetInstance;
    onSubmit: (data: DamageReportFormData) => void;
    isLoading?: boolean;
    maxAmount?: number;
}

/** Items are found by server search; assemblies come from the caller's explicit complete list. */
export function DamageReportForm({
    assemblies = [], preselectedItemId, preselectedAssetId, preselectedAssemblyId,
    preselectedAsset, onSubmit, isLoading, maxAmount,
}: DamageReportFormProps) {
    useAppLanguage();
    const t = useT();
    const severities: { value: DamageSeverity; label: string }[] = SEVERITY_LEVELS.map((value) => ({ value, label: nameFor('severity', value) }));
    const [targetType, setTargetType] = useState<'item' | 'assembly'>(preselectedAssemblyId ? 'assembly' : 'item');
    const [formData, setFormData] = useState<DamageReportFormData>({
        itemId: preselectedItemId,
        assemblyId: preselectedAssemblyId,
        assetInstanceId: preselectedAssetId,
        amount: 1,
        description: '',
        severity: 'medium',
    });
    const [amountInput, setAmountInput] = useState('1');
    const selectedItem = useItemsByIds(formData.itemId ? [formData.itemId] : []).data?.[0];
    const needsAsset = selectedItem?.trackingMode === 'serialized';
    const { data: itemAssets = [], isLoading: assetsLoading } = useItemAssets(needsAsset ? selectedItem?.id : undefined);
    const activeAssets = itemAssets.filter((asset) => asset.active);
    const selectedAsset = preselectedAsset ?? activeAssets.find((asset) => asset.id === formData.assetInstanceId) ?? null;
    const positions = useCompleteList(['operations', `damage-positions:${selectedItem?.id ?? ''}`], operationsApi.positions({ itemId: selectedItem?.id }), { enabled: Boolean(selectedItem && !needsAsset) });
    const lookup = useStockLookups();
    const candidates = (positions.data ?? []).filter(position => position.quantityOnHand > position.quantityDamaged + position.quantityQuarantined);
    const positionId = formData.positionId ?? (candidates.length === 1 ? candidates[0].id : undefined);
    const position = candidates.find(position => position.id === positionId);
    const effectiveMaxAmount = needsAsset ? 1 : position ? Math.min(maxAmount ?? Infinity, position.quantityOnHand - position.quantityDamaged - position.quantityQuarantined) : maxAmount;
    const positionMissing = Boolean(selectedItem && !needsAsset && (!positions.isComplete || candidates.length > 0 && !position));

    function selectItem(item: Item | null) {
        setAmountInput('1');
        setFormData((previous) => ({ ...previous, itemId: item?.id, assemblyId: undefined, assetInstanceId: undefined, positionId: undefined, amount: 1 }));
    }

    function selectAssembly(assembly: Assembly | null) {
        setAmountInput('1');
        setFormData((previous) => ({ ...previous, itemId: undefined, assemblyId: assembly?.id, assetInstanceId: undefined, positionId: undefined, amount: 1 }));
    }

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        const amount = Number(amountInput);
        if (!Number.isInteger(amount) || amount < 1 || (!formData.itemId && !formData.assemblyId)) return;
        if (needsAsset && !formData.assetInstanceId || positionMissing) return;
        onSubmit({ ...formData, amount, positionId });
    }

    const invalidAmount = amountInput === '' || !Number.isInteger(Number(amountInput)) || Number(amountInput) < 1
        || (effectiveMaxAmount !== undefined && Number(amountInput) > effectiveMaxAmount);

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                {!preselectedItemId && !preselectedAssemblyId && <>
                    <ToggleButtonGroup exclusive size="small" value={targetType} aria-label={t('forms.damageReportForm.damageTarget')}
                        onChange={(_, value: 'item' | 'assembly' | null) => { if (value) { setTargetType(value); selectItem(null); } }}>
                        <ToggleButton value="item">{t('common.item')}</ToggleButton>
                        <ToggleButton value="assembly">{t('enum.value.assembly')}</ToggleButton>
                    </ToggleButtonGroup>
                    {targetType === 'item'
                        ? <ItemAutocomplete label={t('forms.damageReportForm.searchItem')} required value={formData.itemId} onChange={selectItem} />
                        : <Autocomplete options={assemblies} value={assemblies.find((assembly) => assembly.id === formData.assemblyId) ?? null}
                            onChange={(_, assembly) => selectAssembly(assembly)} isOptionEqualToValue={(option, value) => option.id === value.id}
                            getOptionLabel={(assembly) => assembly.name}
                            renderInput={(params) => <TextField {...params} label={t('forms.damageReportForm.searchAssembly')} required />} />}
                </>}

                {(preselectedItemId || preselectedAssemblyId) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary">{t('forms.damageReportForm.damageTarget')}:</Typography>
                        <Chip label={preselectedAsset?.assetCode ?? selectedItem?.name ?? assemblies.find((assembly) => assembly.id === preselectedAssemblyId)?.name ?? t('forms.damageReportForm.selected')} color="primary" variant="outlined" />
                    </Box>
                )}

                {needsAsset && !preselectedAssetId && (
                    <Autocomplete
                        options={activeAssets}
                        value={selectedAsset}
                        loading={assetsLoading}
                        onChange={(_, asset) => setFormData((previous) => ({ ...previous, assetInstanceId: asset?.id }))}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        getOptionLabel={(asset) => [asset.assetCode, asset.serialNumber && `S/N ${asset.serialNumber}`].filter(Boolean).join(' · ')}
                        renderInput={(params) => <TextField {...params} label={t('forms.damageReportForm.searchDamagedSerializedAsset')} required helperText={t('forms.damageReportForm.chooseTheExactUnitForSerializedItems')} />}
                    />
                )}

                {selectedItem && !needsAsset && <>
                    <QueryFeedback error={positions.error} isLoading={!positions.isComplete && !positions.error} />
                    {candidates.length > 0 && <TextField select required label={t('common.storageLocation')} value={positionId ?? ''}
                        onChange={event => setFormData(previous => ({ ...previous, positionId: event.target.value }))}>
                        {candidates.map(position => <MenuItem key={position.id} value={position.id}>
                            {lookup.locationOptions.find(location => location.value === position.locationId)?.label ?? position.locationId}
                            {position.lotId ? ` · ${position.lotId}` : ''} · {formatQuantity(selectedItem, position.quantityOnHand - position.quantityDamaged - position.quantityQuarantined)}
                        </MenuItem>)}
                    </TextField>}
                </>}

                <TextField select label={t('common.severity')} value={formData.severity} onChange={(event) => setFormData((previous) => ({ ...previous, severity: event.target.value as DamageSeverity }))} required fullWidth>
                    {severities.map((severity) => <MenuItem key={severity.value} value={severity.value}>{severity.label}</MenuItem>)}
                </TextField>
                <TextField label={usesPercentage(selectedItem) ? `${t('common.quantity')} (%)` : t('common.quantity')} type="number" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} slotProps={{ htmlInput: { min: 1, max: effectiveMaxAmount, step: 1 } }} helperText={needsAsset ? t('forms.damageReportForm.aSerializedAssetAlwaysHasQuantity1') : selectedItem ? formatQuantity(selectedItem, Number(amountInput) || 0) : undefined} disabled={needsAsset} required fullWidth />
                <TextField label={t('common.description')} value={formData.description} onChange={(event) => setFormData((previous) => ({ ...previous, description: event.target.value }))} multiline rows={4} required fullWidth />

                <Button title={translate('forms.damageReportForm.submitTheDamageReportWithQuantityAndDescription')} type="submit" variant="contained" color="error" disabled={isLoading || positionMissing || (!formData.itemId && !formData.assemblyId) || (needsAsset && !formData.assetInstanceId) || !formData.description.trim() || invalidAmount} sx={{ minHeight: 48 }}>
                    {t('forms.damageReportForm.submitDamageReport')}
                </Button>
            </Stack>
        </Box>
    );
}
