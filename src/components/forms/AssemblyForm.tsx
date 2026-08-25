import { useState, useMemo } from 'react';
import {
    Box,
    TextField,
    Button,
    Stack,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Checkbox,
    Paper,
    Typography,
    Chip,
    IconButton,
    Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import type { AssemblyFormData, Assembly, Item } from '../../types';
import { useTranslate } from '../../utils/naming';

interface Props {
    initialData?: Assembly;
    items: Item[];
    onSubmit: (data: AssemblyFormData) => void;
    isLoading?: boolean;
}

export function AssemblyForm({ initialData, items, onSubmit, isLoading }: Props) {
    const t = useTranslate();
    const [formData, setFormData] = useState<AssemblyFormData>({
        name: initialData?.name ?? '',
        itemIds: Array.isArray(initialData?.itemIds) ? initialData.itemIds : [],
        itemQuantities: initialData?.itemQuantities ?? {},
        description: initialData?.description ?? '',
    });
    const [search, setSearch] = useState('');

    const filteredItems = useMemo(() => {
        if (!search.trim()) return items;
        const lower = search.toLowerCase();
        return items.filter(
            (item) =>
                item.name.toLowerCase().includes(lower) ||
                (item.category && item.category.toLowerCase().includes(lower)) ||
                (item.storageLocation && item.storageLocation.toLowerCase().includes(lower)),
        );
    }, [items, search]);

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
        onSubmit(formData);
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

                {selectedItems.length > 0 && (
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                            {t('Ausgewählte Artikel', 'Selected items')}
                        </Typography>
                        <Stack spacing={0.5}>
                            {selectedItems.map((item) => (
                                <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip
                                        label={item.name}
                                        size="small"
                                        onDelete={() => handleToggle(item.id)}
                                        sx={{ flexGrow: 1, justifyContent: 'flex-start' }}
                                    />
                                    <Tooltip title={t('Menge verringern', 'Decrease quantity')} arrow>
                                        <IconButton type="button" size="small" onClick={() => handleQuantityChange(item.id, -1)}>
                                            <RemoveIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>
                                        {formData.itemQuantities[item.id] ?? 1}
                                    </Typography>
                                    <Tooltip title={t('Menge erhöhen', 'Increase quantity')} arrow>
                                        <IconButton type="button" size="small" onClick={() => handleQuantityChange(item.id, 1)}>
                                            <AddIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
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
                                    <ListItemButton onClick={() => handleToggle(item.id)} dense>
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

                <Tooltip title={initialData ? t('Änderungen an dieser Baugruppe speichern', 'Save changes to this assembly') : t('Neue Baugruppe erstellen', 'Create a new assembly')} arrow>
                    <span>
                        <Button type="submit" variant="contained" disabled={isLoading || !formData.name}>
                            {initialData ? t('Baugruppe aktualisieren', 'Update assembly') : t('Baugruppe erstellen', 'Create assembly')}
                        </Button>
                    </span>
                </Tooltip>
            </Stack>
        </Box>
    );
}
