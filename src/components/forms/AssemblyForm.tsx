import { Chip, IconButton, ListItemButton } from '../shared/ActionButtons';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { DialogForm, FormSection } from '../shared/FormDialog';
import { ImageAttachments, type ImageAttachmentState } from '../common/ImageAttachments';
import { useState } from 'react';
import { Box, TextField, Stack, List, ListItem, ListItemIcon, ListItemText, Checkbox, Paper, Typography, Autocomplete, FormControlLabel, FormHelperText, Switch } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { type AssemblyFormData, type Assembly, type Item } from '../../types';
import { translate, useLocalizedText } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canEditCatalog } from '../../utils/access';

interface Props {
    title: string;
    initialData?: Assembly;
    items: Item[];
    onSubmit: (data: AssemblyFormData) => void;
    onCancel: () => void;
    isLoading?: boolean;
}

export function AssemblyForm({ title, initialData, items, onSubmit, onCancel, isLoading }: Props) {
    const t = useLocalizedText();
    const { eventTypes } = useFactionCatalog();
    const { user } = useAuth();
    const canCreatePublic = canEditCatalog(user);
    const [formData, setFormData] = useState<AssemblyFormData>({
        privateResource: initialData ? Boolean(initialData.access?.privateResource) : true,
        name: initialData?.name ?? '',
        itemIds: Array.isArray(initialData?.itemIds) ? initialData.itemIds : [],
        itemQuantities: initialData?.itemQuantities ?? {},
        description: initialData?.description ?? '',
        hint: initialData?.hint ?? '',
        eventTypes: initialData?.eventTypes ?? [],
    });
    const [search, setSearch] = useState('');
    const [images, setImages] = useState<ImageAttachmentState>({ files: [], removed: [], replacements: {} });

    const filteredItems = (() => {
        if (!search.trim()) return items;
        const lower = search.toLowerCase();
        return items.filter(
            (item) =>
                item.name.toLowerCase().includes(lower) ||
                (item.category && item.category.toLowerCase().includes(lower)) ||
                (item.storageLocation && item.storageLocation.toLowerCase().includes(lower)),
        );
    })();

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

    const selectedItems = items.filter((i) => formData.itemIds.includes(i.id));

    return (
        <DialogForm title={title} onSubmit={handleSubmit} onCancel={onCancel} noValidate pending={isLoading} submitDisabled={!formData.name.trim()}
            submitLabel={initialData ? t('Baugruppe speichern', 'Save assembly') : t('Baugruppe erstellen', 'Create assembly')}>
            <FormSection title={t('Grunddaten', 'Basic details')}>
                <TextField
                    label={t('Name', 'Name')}
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    fullWidth
                />
                <TextField
                    label={t('Beschreibung', 'Description')}
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    multiline
                    minRows={2}
                    fullWidth
                />
            </FormSection>

            <FormSection title={t('Sichtbarkeit', 'Visibility')}>
                <Box>
                    <FormControlLabel
                        control={<Switch checked={Boolean(formData.privateResource)} disabled={Boolean(initialData) || !canCreatePublic}
                            onChange={(_, checked) => setFormData((prev) => ({ ...prev, privateResource: checked }))} />}
                        label={formData.privateResource ? t('Private Baugruppe', 'Private assembly') : t('Im gemeinsamen Katalog', 'In the shared catalog')} />
                    <FormHelperText sx={{ mt: 0 }}>
                        {formData.privateResource
                            ? t('Nur du, HQ-Admins und Personen, für die du sie freigibst, sehen diese Baugruppe.', 'Only you, HQ admins and people you share it with can see this assembly.')
                            : t('Alle mit Katalogzugriff sehen diese Baugruppe.', 'Everyone with catalog access can see this assembly.')}
                        {initialData ? ` ${t('Die Sichtbarkeit kann nach dem Anlegen nicht geändert werden.', 'Visibility cannot be changed after creation.')}` : ''}
                    </FormHelperText>
                </Box>
            </FormSection>

            <FormSection title={t('Bestandteile', 'Components')} description={t(`${selectedItems.length} Artikel ausgewählt`, `${selectedItems.length} items selected`)}>
                {selectedItems.length > 0 && (
                    <Stack spacing={0.5}>
                        {selectedItems.map((item) => (
                            <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip title={translate('Diesen Artikel aus der Auswahl entfernen', 'Remove this item from the selection')}
                                    label={item.name}
                                    onDelete={() => handleToggle(item.id)}
                                    sx={{ flexGrow: 1, justifyContent: 'space-between', minWidth: 0 }}
                                />
                                <IconButton title={t('Menge verringern', 'Decrease quantity')} type="button" onClick={() => handleQuantityChange(item.id, -1)}>
                                    <RemoveIcon fontSize="small" />
                                </IconButton>
                                <Typography variant="body2" className="tabular" aria-live="polite" sx={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>
                                    {formData.itemQuantities[item.id] ?? 1}
                                </Typography>
                                <IconButton title={t('Menge erhöhen', 'Increase quantity')} type="button" onClick={() => handleQuantityChange(item.id, 1)}>
                                    <AddIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        ))}
                    </Stack>
                )}
                <TextField
                    label={t('Artikel suchen', 'Search items')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    fullWidth
                    size="small"
                />
                <Paper variant="outlined" sx={{ maxHeight: 280, overflow: 'auto' }}>
                    {filteredItems.length === 0 ? (
                        <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                            {t('Keine Artikel gefunden', 'No items found')}
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
                </Paper>
            </FormSection>

            <FormSection title={t('Weitere Angaben', 'Additional details')}>
                <TextField
                    label={t('Montageanweisung', 'Assembly instructions')}
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
                    renderInput={(params) => <TextField {...params} label={t('Benötigt für Events', 'Needed for events')} />}
                />
                <ImageAttachments existing={initialData?.image ? [initialData.image] : []} value={images} onChange={setImages} maxImages={1} disabled={isLoading} />
            </FormSection>
        </DialogForm>
    );
}
