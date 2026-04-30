import { useState } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { ItemForm } from '../components/forms/ItemForm';
import { ItemsList } from '../components/lists/ItemsList';
import { QRCodeGenerator } from '../components/qr/QRCodeGenerator';
import { useItems, useCreateItem, useUpdateItem, useDeleteItem } from '../hooks/useItems';
import { useTransactions } from '../hooks/useTransactions';
import { useUIStore } from '../store/uiStore';
import type { Item, ItemFormData } from '../types';

export function Items() {
    const { data: items, isLoading } = useItems();
    const { data: transactions } = useTransactions();
    const createItem = useCreateItem();
    const updateItem = useUpdateItem();
    const deleteItem = useDeleteItem();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const [formOpen, setFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Item | undefined>();
    const [qrItem, setQrItem] = useState<Item | undefined>();
    const [deletingId, setDeletingId] = useState<string | undefined>();

    const storageLocations = [...new Set(items?.map((i) => i.storageLocation).filter(Boolean) ?? [])];
    const categories = [...new Set(items?.map((i) => i.category).filter(Boolean) ?? [])];
    const positions = [...new Set(items?.map((i) => i.position).filter(Boolean) ?? [])];
    const locations = [...new Set(items?.map((i) => i.location).filter(Boolean) ?? [])];
    const allNames = items?.map((i) => i.name) ?? [];

    function handleCreate(data: ItemFormData) {
        createItem.mutate(data, {
            onSuccess: () => {
                setFormOpen(false);
                showSnackbar('Item created successfully', 'success');
            },
            onError: () => showSnackbar('Failed to create item', 'error'),
        });
    }

    function handleUpdate(data: ItemFormData) {
        if (!editingItem) return;
        updateItem.mutate(
            { id: editingItem.id, data },
            {
                onSuccess: () => {
                    setEditingItem(undefined);
                    showSnackbar('Item updated successfully', 'success');
                },
                onError: () => showSnackbar('Failed to update item', 'error'),
            },
        );
    }

    function handleDelete(id: string) {
        setDeletingId(id);
    }

    function handleDeleteConfirm() {
        if (!deletingId) return;
        deleteItem.mutate(deletingId, {
            onSuccess: () => {
                setDeletingId(undefined);
                showSnackbar('Item deleted', 'success');
            },
            onError: () => showSnackbar('Failed to delete item', 'error'),
        });
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Items</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
                    Add Item
                </Button>
            </Box>

            <ItemsList
                items={items}
                transactions={transactions}
                isLoading={isLoading}
                onEdit={setEditingItem}
                onDelete={handleDelete}
                onShowQR={setQrItem}
            />

            {/* Create Dialog */}
            <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create New Item</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <ItemForm onSubmit={handleCreate} isLoading={createItem.isPending} storageLocations={storageLocations} categories={categories} positions={positions} locations={locations} existingNames={allNames} />
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editingItem} onClose={() => setEditingItem(undefined)} maxWidth="sm" fullWidth>
                <DialogTitle>Edit Item</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {editingItem && (
                        <ItemForm initialData={editingItem} onSubmit={handleUpdate} isLoading={updateItem.isPending} storageLocations={storageLocations} categories={categories} positions={positions} locations={locations} existingNames={allNames.filter((n) => n !== editingItem.name)} />
                    )}
                </DialogContent>
            </Dialog>

            {/* QR Code Dialog */}
            <Dialog open={!!qrItem} onClose={() => setQrItem(undefined)} maxWidth="xs" fullWidth>
                <DialogTitle>QR Code</DialogTitle>
                <DialogContent>
                    {qrItem && <QRCodeGenerator itemId={qrItem.id} itemName={qrItem.name} />}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingId} onClose={() => setDeletingId(undefined)}>
                <DialogTitle>Delete Item</DialogTitle>
                <DialogContent>
                    <DialogContentText>Are you sure you want to delete this item? This action cannot be undone.</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeletingId(undefined)}>Cancel</Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained" disabled={deleteItem.isPending}>
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
