import { useState } from 'react';
import { Autocomplete, Box, Button, Chip, createFilterOptions, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import type { Assembly, AssetInstance, DamageReportFormData, DamageSeverity, Item } from '../../types';
import { useItemAssets } from '../../hooks/useItems';
import { nameFor, useAppLanguage, useLocalizedText } from '../../utils/naming';
import { SEVERITY_LEVELS } from '../../utils/constants';

interface Props {
    items: Item[];
    assemblies?: Assembly[];
    preselectedItemId?: string;
    preselectedAssetId?: string;
    preselectedAssemblyId?: string;
    preselectedAsset?: AssetInstance;
    onSubmit: (data: DamageReportFormData) => void;
    isLoading?: boolean;
    maxAmount?: number;
}

type DamageTarget =
    | { key: string; type: 'item'; item: Item }
    | { key: string; type: 'assembly'; assembly: Assembly };

const filterDamageTargets = createFilterOptions<DamageTarget>({
    stringify: (target) => target.type === 'item'
        ? [target.item.name, target.item.sku, target.item.category, target.item.subcategory].filter(Boolean).join(' ')
        : [target.assembly.name, target.assembly.description].filter(Boolean).join(' '),
});

export function DamageReportForm({
    items, assemblies = [], preselectedItemId, preselectedAssetId, preselectedAssemblyId,
    preselectedAsset, onSubmit, isLoading, maxAmount,
}: Props) {
    useAppLanguage();
    const t = useLocalizedText();
    const severities: { value: DamageSeverity; label: string }[] = SEVERITY_LEVELS.map((value) => ({ value, label: nameFor('severity', value) }));
    const initialTargetKey = preselectedAssemblyId
        ? `assembly:${preselectedAssemblyId}`
        : preselectedItemId ? `item:${preselectedItemId}` : '';
    const [targetKey, setTargetKey] = useState(initialTargetKey);
    const [formData, setFormData] = useState<DamageReportFormData>({
        itemId: preselectedItemId,
        assemblyId: preselectedAssemblyId,
        assetInstanceId: preselectedAssetId,
        amount: 1,
        description: '',
        severity: 'medium',
    });
    const [amountInput, setAmountInput] = useState('1');
    const targets: DamageTarget[] = [
        ...items.map((item) => ({ key: `item:${item.id}`, type: 'item' as const, item })),
        ...assemblies.map((assembly) => ({ key: `assembly:${assembly.id}`, type: 'assembly' as const, assembly })),
    ];
    const selectedTarget = targets.find((target) => target.key === targetKey) ?? null;
    const selectedItem = selectedTarget?.type === 'item'
        ? selectedTarget.item
        : items.find((item) => item.id === preselectedItemId);
    const needsAsset = selectedItem?.trackingMode === 'serialized';
    const { data: itemAssets = [], isLoading: assetsLoading } = useItemAssets(needsAsset ? selectedItem?.id : undefined);
    const activeAssets = itemAssets.filter((asset) => asset.active);
    const selectedAsset = preselectedAsset ?? activeAssets.find((asset) => asset.id === formData.assetInstanceId) ?? null;
    const effectiveMaxAmount = needsAsset ? 1 : maxAmount;

    function selectTarget(target: DamageTarget | null) {
        setTargetKey(target?.key ?? '');
        setAmountInput('1');
        if (target?.type === 'item') {
            setFormData((previous) => ({ ...previous, itemId: target.item.id, assemblyId: undefined, assetInstanceId: undefined, amount: 1 }));
        } else if (target?.type === 'assembly') {
            setFormData((previous) => ({ ...previous, itemId: undefined, assemblyId: target.assembly.id, assetInstanceId: undefined, amount: 1 }));
        } else {
            setFormData((previous) => ({ ...previous, itemId: undefined, assemblyId: undefined, assetInstanceId: undefined }));
        }
    }

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        const amount = Number(amountInput);
        if (!Number.isInteger(amount) || amount < 1 || (!formData.itemId && !formData.assemblyId)) return;
        if (needsAsset && !formData.assetInstanceId) return;
        onSubmit({ ...formData, amount });
    }

    const invalidAmount = amountInput === '' || !Number.isInteger(Number(amountInput)) || Number(amountInput) < 1
        || (effectiveMaxAmount !== undefined && Number(amountInput) > effectiveMaxAmount);

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                {!preselectedItemId && !preselectedAssemblyId && (
                    <Autocomplete
                        options={targets}
                        filterOptions={filterDamageTargets}
                        value={selectedTarget}
                        onChange={(_, target) => selectTarget(target)}
                        isOptionEqualToValue={(option, value) => option.key === value.key}
                        getOptionLabel={(target) => target.type === 'item' ? target.item.name : target.assembly.name}
                        groupBy={(target) => target.type === 'item' ? t('Artikel', 'Items') : t('Baugruppen', 'Assemblies')}
                        renderOption={(props, target) => (
                            <li {...props} key={target.key}>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography>{target.type === 'item' ? target.item.name : target.assembly.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {target.type === 'item' ? [target.item.sku, target.item.category].filter(Boolean).join(' · ') : t('Baugruppe', 'Assembly')}
                                    </Typography>
                                </Box>
                            </li>
                        )}
                        renderInput={(params) => <TextField {...params} label={t('Artikel oder Baugruppe suchen', 'Search item or assembly')} placeholder={t('Name, SKU oder Kategorie eingeben…', 'Type a name, SKU, or category…')} required />}
                    />
                )}

                {(preselectedItemId || preselectedAssemblyId) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" color="text.secondary">{t('Schadensobjekt', 'Damage target')}:</Typography>
                        <Chip label={preselectedAsset?.assetCode ?? selectedItem?.name ?? assemblies.find((assembly) => assembly.id === preselectedAssemblyId)?.name ?? t('Ausgewählt', 'Selected')} color="primary" variant="outlined" />
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
                        renderInput={(params) => <TextField {...params} label={t('Beschädigtes Einzelgerät suchen', 'Search damaged serialized asset')} required helperText={t('Bei serialisierten Artikeln muss das konkrete Einzelgerät gewählt werden.', 'Choose the exact unit for serialized items.')} />}
                    />
                )}

                <TextField select label={t('Schweregrad', 'Severity')} value={formData.severity} onChange={(event) => setFormData((previous) => ({ ...previous, severity: event.target.value as DamageSeverity }))} required fullWidth>
                    {severities.map((severity) => <MenuItem key={severity.value} value={severity.value}>{severity.label}</MenuItem>)}
                </TextField>
                <TextField label={t('Menge', 'Quantity')} type="number" value={amountInput} onChange={(event) => setAmountInput(event.target.value)} slotProps={{ htmlInput: { min: 1, max: effectiveMaxAmount, step: 1 } }} helperText={needsAsset ? t('Ein serialisiertes Einzelgerät entspricht der Menge 1.', 'A serialized asset always has quantity 1.') : undefined} disabled={needsAsset} required fullWidth />
                <TextField label={t('Beschreibung', 'Description')} value={formData.description} onChange={(event) => setFormData((previous) => ({ ...previous, description: event.target.value }))} multiline rows={4} required fullWidth />
                <Tooltip title={t('Neuen Schadensbericht einreichen', 'Submit a new damage report')} arrow>
                    <span>
                        <Button type="submit" variant="contained" color="error" disabled={isLoading || (!formData.itemId && !formData.assemblyId) || (needsAsset && !formData.assetInstanceId) || !formData.description.trim() || invalidAmount} sx={{ minHeight: 48 }}>
                            {t('Schadensbericht einreichen', 'Submit damage report')}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>
        </Box>
    );
}
