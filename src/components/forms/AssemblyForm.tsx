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
} from '@mui/material';
import type { AssemblyFormData, Assembly, Item } from '../../types';

interface Props {
    initialData?: Assembly;
    items: Item[];
    onSubmit: (data: AssemblyFormData) => void;
    isLoading?: boolean;
}

export function AssemblyForm({ initialData, items, onSubmit, isLoading }: Props) {
    const [formData, setFormData] = useState<AssemblyFormData>({
        name: initialData?.name ?? '',
        itemIds: Array.isArray(initialData?.itemIds) ? initialData.itemIds : [],
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
            if (selected.has(itemId)) {
                selected.delete(itemId);
            } else {
                selected.add(itemId);
            }
            return { ...prev, itemIds: [...selected] };
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
                    label="Assembly Name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    fullWidth
                />
                <TextField
                    label="Description"
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    multiline
                    rows={3}
                    fullWidth
                />

                {selectedItems.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selectedItems.map((item) => (
                            <Chip
                                key={item.id}
                                label={item.name}
                                size="small"
                                onDelete={() => handleToggle(item.id)}
                            />
                        ))}
                    </Box>
                )}

                <TextField
                    label="Search items..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    fullWidth
                    size="small"
                />

                <Paper variant="outlined" sx={{ maxHeight: 250, overflow: 'auto' }}>
                    {filteredItems.length === 0 ? (
                        <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                            No items found
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

                <Button type="submit" variant="contained" disabled={isLoading || !formData.name}>
                    {initialData ? 'Update Assembly' : 'Create Assembly'}
                </Button>
            </Stack>
        </Box>
    );
}
