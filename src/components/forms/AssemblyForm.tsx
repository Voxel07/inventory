import { Chip, IconButton, ListItemButton, Button } from '../shared/ActionButtons';
import { ImageAttachments, type ImageAttachmentState } from '../common/ImageAttachments';
import { useState } from 'react';
import { Box, TextField, Stack, List, ListItem, ListItemIcon, ListItemText, Checkbox, Paper, Typography, Autocomplete } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { EVENT_TYPES, type AssemblyFormData, type Assembly, type Item } from '../../types';
import { translate, useLocalizedText } from '../../utils/naming';

interface Props {
    initialData?: Assembly;
    items: Item[];
    onSubmit: (data: AssemblyFormData) => void;
    isLoading?: boolean;
}

export function AssemblyForm({ initialData, items, onSubmit, isLoading }: Props) {
    const t = useLocalizedText();
    const [formData, setFormData] = useState<AssemblyFormData>({
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

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        onSubmit({ ...formData, imageFile: images.files[0] ?? (initialData?.image && !images.removed.includes(initialData.image) ? images.replacements[initialData.image] : undefined), removeImage: Boolean(initialData?.image && images.removed.includes(initialData.image)) });
    }

    const selectedItems = items.filter((i) => formData.itemIds.includes(i.id));

    return (
        <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2}>
                <TextField
                    label={t('Baugruppenname', 'Assembly name')}
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
                    rows={3}
                    fullWidth
                />
                <TextField
                    label={t('Hinweis / Montageanweisung', 'Hint / assembly instructions')}
                    value={formData.hint ?? ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, hint: e.target.value }))}
                    multiline
                    minRows={2}
                    fullWidth
                />

                <Autocomplete
                    multiple
                    options={[...EVENT_TYPES]}
                    value={formData.eventTypes ?? []}
                    onChange={(_event, values) => setFormData((prev) => ({ ...prev, eventTypes: values }))}
                    renderInput={(params) => <TextField {...params} label={t('Benötigt für Events', 'Needed for events')} />}
                />

                <ImageAttachments existing={initialData?.image ? [initialData.image] : []} value={images} onChange={setImages} maxImages={1} disabled={isLoading} />

                {selectedItems.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                            {t('Ausgewählte Artikel', 'Selected items')}
                        </Typography>
                        <Stack spacing={0.5}>
                            {selectedItems.map((item) => (
                                <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip title={translate('Diesen Artikel aus der Auswahl entfernen', 'Remove this item from the selection')}
                                        label={item.name}
                                        size="small"
                                        onDelete={() => handleToggle(item.id)}
                                        sx={{ flexGrow: 1, justifyContent: 'flex-start' }}
                                    />

                                    <IconButton title={t('Menge verringern', 'Decrease quantity')} type="button" size="small" onClick={() => handleQuantityChange(item.id, -1)}>
                                        <RemoveIcon fontSize="small" />
                                    </IconButton>

                                    <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>
                                        {formData.itemQuantities[item.id] ?? 1}
                                    </Typography>

                                    <IconButton title={t('Menge erhöhen', 'Increase quantity')} type="button" size="small" onClick={() => handleQuantityChange(item.id, 1)}>
                                        <AddIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            ))}
                        </Stack>
                    </Paper>
                )}

                <TextField
                    label={t('Artikel suchen...', 'Search items...')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    fullWidth
                    size="small"
                />

                <Paper variant="outlined" sx={{ maxHeight: 250, overflow: 'auto' }}>
                    {filteredItems.length === 0 ? (
                        <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                            {t('Keine Artikel gefunden', 'No items found')}
                        </Typography>
                    ) : (
                        <List dense disablePadding>
                            {filteredItems.map((item) => (
                                <ListItem key={item.id} disablePadding>
                                    <ListItemButton title={translate('Artikel zur Baugruppe hinzufügen oder entfernen', 'Add or remove this item from the assembly')} onClick={() => handleToggle(item.id)} dense>
                                        <ListItemIcon sx={{ minWidth: 36 }}>
                                            <Checkbox
                                                edge="start"
                                                checked={formData.itemIds.includes(item.id)}
                                                tabIndex={-1}
                                                disableRipple
                                            />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={item.name}
                                            secondary={[item.category, item.storageLocation].filter(Boolean).join(' · ')}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Paper>

                <Button title={translate('Die Baugruppe mit den gewählten Artikeln speichern', 'Save the assembly with the selected items')} type="submit" variant="contained" disabled={isLoading || !formData.name}>
                    {initialData ? t('Baugruppe aktualisieren', 'Update assembly') : t('Baugruppe erstellen', 'Create assembly')}
                </Button>
            </Stack>
        </Box>
    );
}
