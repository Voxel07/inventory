import { useState } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { AssembliesList } from '../components/lists/AssembliesList';
import { useAssemblies, useCreateAssembly, useUpdateAssembly, useDeleteAssembly } from '../hooks/useAssemblies';
import { useItems } from '../hooks/useItems';
import { useUIStore } from '../store/uiStore';
import type { Assembly, AssemblyFormData } from '../types';

export function Assemblies() {
    const { data: assemblies, isLoading } = useAssemblies();
    const { data: items } = useItems();
    const createAssembly = useCreateAssembly();
    const updateAssembly = useUpdateAssembly();
    const deleteAssembly = useDeleteAssembly();
    const showSnackbar = useUIStore((s) => s.showSnackbar);

    const [formOpen, setFormOpen] = useState(false);
    const [editingAssembly, setEditingAssembly] = useState<Assembly | undefined>();
    const [deletingId, setDeletingId] = useState<string | undefined>();

    function handleCreate(data: AssemblyFormData) {
        createAssembly.mutate(data, {
            onSuccess: () => {
                setFormOpen(false);
                showSnackbar('Assembly created successfully', 'success');
            },
            onError: () => showSnackbar('Failed to create assembly', 'error'),
        });
    }

    function handleUpdate(data: AssemblyFormData) {
        if (!editingAssembly) return;
        updateAssembly.mutate(
            { id: editingAssembly.id, data },
            {
                onSuccess: () => {
                    setEditingAssembly(undefined);
                    showSnackbar('Assembly updated successfully', 'success');
                },
                onError: () => showSnackbar('Failed to update assembly', 'error'),
            },
        );
    }

    function handleDeleteConfirm() {
        if (!deletingId) return;
        deleteAssembly.mutate(deletingId, {
            onSuccess: () => {
                setDeletingId(undefined);
                showSnackbar('Assembly deleted', 'success');
            },
            onError: () => showSnackbar('Failed to delete assembly', 'error'),
        });
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Assemblies</Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
                    Add Assembly
                </Button>
            </Box>

            <AssembliesList
                assemblies={assemblies}
                items={items}
                isLoading={isLoading}
                onEdit={setEditingAssembly}
                onDelete={setDeletingId}
            />

            {/* Create Dialog */}
            <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create New Assembly</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <AssemblyForm items={items ?? []} onSubmit={handleCreate} isLoading={createAssembly.isPending} />
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editingAssembly} onClose={() => setEditingAssembly(undefined)} maxWidth="sm" fullWidth>
                <DialogTitle>Edit Assembly</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {editingAssembly && (
                        <AssemblyForm
                            initialData={editingAssembly}
                            items={items ?? []}
                            onSubmit={handleUpdate}
                            isLoading={updateAssembly.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingId} onClose={() => setDeletingId(undefined)}>
                <DialogTitle>Delete Assembly</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this assembly? This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeletingId(undefined)}>Cancel</Button>
                    <Button onClick={handleDeleteConfirm} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
