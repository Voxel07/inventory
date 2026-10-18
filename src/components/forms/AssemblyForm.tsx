import { Chip, IconButton, ListItemButton } from '../shared/ActionButtons';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { DialogForm, FormSection } from '../shared/FormDialog';
import { ImageAttachments, type ImageAttachmentState } from '../common/ImageAttachments';
import { useState } from 'react';
import { Box, TextField, Stack, List, ListItem, ListItemIcon, ListItemText, Checkbox, Paper, Typography, Autocomplete, FormControlLabel, FormHelperText, Switch } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { type AssemblyFormData, type Assembly } from '../../types';
import { useItemsByIds, usePagedItems } from '../../hooks/useItems';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { LoadMore } from '../shared/LoadMore';
import { translate, useT } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canEditCatalog } from '../../utils/access';
import { useItemCategories } from '../../hooks/useItems';

interface Props {
    title: string;
    initialData?: Assembly;
    onSubmit: (data: AssemblyFormData) => void;
    onCancel: () => void;
    isLoading?: boolean;
}

/** Components are found by server search; selected components are resolved by id. */
export function AssemblyForm({ title, initialData, onSubmit, onCancel, isLoading }: Props) {
    const t = useT();
    const { eventTypes } = useFactionCatalog();
    const { user } = useAuth();
    const canCreatePublic = canEditCatalog(user);
    const { data: categories = [] } = useItemCategories();
    const [formData, setFormData] = useState<AssemblyFormData>({
        // Staff add to the shared catalog by default; members can only create private assemblies.
        privateResource: initialData ? Boolean(initialData.access?.privateResource) : !canCreatePublic,
        name: initialData?.name ?? '',
        category: initialData?.category ?? '',
        subcategory: initialData?.subcategory ?? '',
        itemIds: Array.isArray(initialData?.itemIds) ? initialData.itemIds : [],
        itemQuantities: initialData?.itemQuantities ?? {},
        description: initialData?.description ?? '',
        hint: initialData?.hint ?? '',
        eventTypes: initialData?.eventTypes ?? [],
    });
    const [search, setSearch] = useState('');
    const [images, setImages] = useState<ImageAttachmentState>({ files: [], removed: [], replacements: {} });

    const results = usePagedItems({ search: useDebouncedValue(search.trim()) || undefined, sort: 'name' }, { size: 25 });
    const filteredItems = results.data ?? [];
    const selected = useItemsByIds(formData.itemIds);

    function handleToggle(itemId: string) {
        setFormData((prev) => {
            const selected = new Set(prev.itemIds);
            const quantities = { ...prev.itemQuantities };
            if (selected.has(itemId)) {
                selected.delete(itemId);
                delete quantities[itemId];
            } else {
                selected.add(itemId);
                quantities[itemId] = 1;
            }
            return { ...prev, itemIds: [...selected], itemQuantities: quantities };
        });
    }

    function handleQuantityChange(itemId: string, delta: number) {
        setFormData((prev) => {
            const current = prev.itemQuantities[itemId] ?? 1;
            const newQty = Math.max(1, current + delta);
            return { ...prev, itemQuantities: { ...prev.itemQuantities, [itemId]: newQty } };
        });
    }

    function handleSubmit() {
        onSubmit({ ...formData, imageFile: images.files[0] ?? (initialData?.image && !images.removed.includes(initialData.image) ? images.replacements[initialData.image] : undefined), removeImage: Boolean(initialData?.image && images.removed.includes(initialData.image)) });
    }

    const selectedItems = (selected.data ?? []).filter((i) => formData.itemIds.includes(i.id));

    return (
        <DialogForm title={title} onSubmit={handleSubmit} onCancel={onCancel} noValidate pending={isLoading} submitDisabled={!formData.name.trim()}
            submitLabel={initialData ? t('forms.assemblyForm.saveAssembly') : t('forms.assemblyForm.createAssembly')}>
            <FormSection title={t('forms.assemblyForm.basicDetails')}>
                <TextField
                    label={t('profile.name')}
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    fullWidth
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Autocomplete
                        freeSolo
                        fullWidth
                        options={categories}
                        value={formData.category ?? ''}
                        onInputChange={(_e, value) => setFormData((prev) => ({ ...prev, category: value }))}
                        renderInput={(params) => <TextField {...params} label={t('common.category')} fullWidth />}
                    />
                    <TextField
                        label={t('forms.itemForm.subcategory')}
                        value={formData.subcategory ?? ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, subcategory: e.target.value }))}
                        helperText={t('forms.itemForm.optional')}
                        fullWidth
                    />
                </Stack>
                <TextField
                    label={t('common.description')}
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    multiline
                    minRows={2}
                    fullWidth
                />
            </FormSection>

            <FormSection title={t('common.visibility')}>
                <Box>
                    <FormControlLabel
                        control={<Switch checked={Boolean(formData.privateResource)} disabled={Boolean(initialData) || !canCreatePublic}
                            onChange={(_, checked) => setFormData((prev) => ({ ...prev, privateResource: checked }))} />}
                        label={formData.privateResource ? t('forms.assemblyForm.privateAssembly') : t('forms.assemblyForm.inTheSharedCatalog')} />
                    <FormHelperText sx={{ mt: 0 }}>
                        {formData.privateResource
                            ? t('forms.assemblyForm.onlyYouInventoryAdminsAndPeopleYouShareItWith')
                            : t('forms.assemblyForm.everyoneWithCatalogAccessCanSeeThisAssembly')}
                        {initialData ? ` ${t('forms.assemblyForm.visibilityCannotBeChangedAfterCreation')}` : ''}
                    </FormHelperText>
                </Box>
            </FormSection>

            <FormSection title={t('forms.assemblyForm.components')} description={t('forms.assemblyForm.selectedItemCountItemsSelected', { selectedItemCount: String(selectedItems.length) })}>
                {selectedItems.length > 0 && (
                    <Stack spacing={0.5}>
                        {selectedItems.map((item) => (
                            <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip title={translate('forms.assemblyForm.removeThisItemFromTheSelection')}
                                    label={item.name}
                                    onDelete={() => handleToggle(item.id)}
                                    sx={{ flexGrow: 1, justifyContent: 'space-between', minWidth: 0 }}
                                />
                                <IconButton title={t('forms.assemblyForm.decreaseQuantity')} type="button" onClick={() => handleQuantityChange(item.id, -1)}>
                                    <RemoveIcon fontSize="small" />
                                </IconButton>
                                <Typography variant="body2" className="tabular" aria-live="polite" sx={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>
                                    {formData.itemQuantities[item.id] ?? 1}
                                </Typography>
                                <IconButton title={t('forms.assemblyForm.increaseQuantity')} type="button" onClick={() => handleQuantityChange(item.id, 1)}>
                                    <AddIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        ))}
                    </Stack>
                )}
                <TextField
                    label={t('common.searchItems')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    fullWidth
                    size="small"
                />
                <Paper variant="outlined" sx={{ maxHeight: 280, overflow: 'auto' }}>
                    {filteredItems.length === 0 ? (
                        <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                            {t('forms.assemblyForm.noItemsFound')}
                        </Typography>
                    ) : (
                        <List dense disablePadding>
                            {filteredItems.map((item) => (
                                <ListItem key={item.id} disablePadding>
                                    <ListItemButton onClick={() => handleToggle(item.id)} sx={{ minHeight: 44 }}>
                                        <ListItemIcon sx={{ minWidth: 36 }}>
                                            <Checkbox
                                                edge="start"
                                                checked={formData.itemIds.includes(item.id)}
                                                tabIndex={-1}
                                                disableRipple
                                                slotProps={{ input: { 'aria-label': item.name } }}
                                            />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={item.name}
                                            secondary={[item.category, item.expand?.storageLocation?.name].filter(Boolean).join(' · ')}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    )}
                    <LoadMore list={results} />
                </Paper>
            </FormSection>

            <FormSection title={t('forms.assemblyForm.additionalDetails')}>
                <TextField
                    label={t('forms.assemblyForm.assemblyInstructions')}
                    value={formData.hint ?? ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, hint: e.target.value }))}
                    multiline
                    minRows={2}
                    fullWidth
                />
                <Autocomplete
                    multiple
                    options={eventTypes}
                    value={formData.eventTypes ?? []}
                    onChange={(_event, values) => setFormData((prev) => ({ ...prev, eventTypes: values }))}
                    renderInput={(params) => <TextField {...params} label={t('forms.assemblyForm.neededForEvents')} />}
                />
                <ImageAttachments existing={initialData?.image ? [initialData.image] : []} value={images} onChange={setImages} maxImages={1} disabled={isLoading} />
            </FormSection>
        </DialogForm>
    );
}
