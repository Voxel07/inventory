import { useState } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { AssembliesList } from '../components/lists/AssembliesList';
import { useAssemblies, useCreateAssembly, useUpdateAssembly, useDeleteAssembly } from '../hooks/useAssemblies';
import { useItems } from '../hooks/useItems';
import { useUIStore } from '../store/uiStore';
import { TooltipButton } from '../components/shared/TooltipButton';
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
                showSnackbar('Baugruppe erfolgreich erstellt', 'success');
            },
            onError: () => showSnackbar('Fehler beim Erstellen der Baugruppe', 'error'),
        });
    }

    function handleUpdate(data: AssemblyFormData) {
        if (!editingAssembly) return;
        updateAssembly.mutate(
            { id: editingAssembly.id, data },
            {
                onSuccess: () => {
                    setEditingAssembly(undefined);
                    showSnackbar('Baugruppe erfolgreich aktualisiert', 'success');
                },
                onError: () => showSnackbar('Fehler beim Aktualisieren der Baugruppe', 'error'),
            },
        );
    }

    function handleDeleteConfirm() {
        if (!deletingId) return;
        deleteAssembly.mutate(deletingId, {
            onSuccess: () => {
                setDeletingId(undefined);
                showSnackbar('Baugruppe gelöscht', 'success');
            },
            onError: () => showSnackbar('Fehler beim Löschen der Baugruppe', 'error'),
        });
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4">Baugruppen</Typography>
                <TooltipButton
                    tooltipText="Eine neue Baugruppe erstellen"
                    icon={<AddIcon />}
                    label="Baugruppe hinzufügen"
                    variant="contained"
                    onClick={() => setFormOpen(true)}
                />
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
                <DialogTitle>Neue Baugruppe erstellen</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <AssemblyForm items={items ?? []} onSubmit={handleCreate} isLoading={createAssembly.isPending} />
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editingAssembly} onClose={() => setEditingAssembly(undefined)} maxWidth="sm" fullWidth>
                <DialogTitle>Baugruppe bearbeiten</DialogTitle>
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
                <DialogTitle>Baugruppe löschen</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Sind Sie sicher, dass Sie diese Baugruppe löschen möchten? Dies kann nicht rückgängig gemacht werden.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Tooltip title="Löschvorgang abbrechen" arrow>
                        <Button onClick={() => setDeletingId(undefined)}>Abbrechen</Button>
                    </Tooltip>
                    <Tooltip title="Diese Baugruppe dauerhaft löschen" arrow>
                        <Button onClick={handleDeleteConfirm} color="error" variant="contained">
                            Löschen
                        </Button>
                    </Tooltip>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
