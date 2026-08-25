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
import { useTranslate } from '../utils/naming';

export function Assemblies() {
    const t = useTranslate();
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
                showSnackbar(t('Baugruppe erfolgreich erstellt', 'Assembly created successfully'), 'success');
            },
            onError: () => showSnackbar(t('Fehler beim Erstellen der Baugruppe', 'Could not create assembly'), 'error'),
        });
    }

    function handleUpdate(data: AssemblyFormData) {
        if (!editingAssembly) return;
        updateAssembly.mutate(
            { id: editingAssembly.id, data },
            {
                onSuccess: () => {
                    setEditingAssembly(undefined);
                    showSnackbar(t('Baugruppe erfolgreich aktualisiert', 'Assembly updated successfully'), 'success');
                },
                onError: () => showSnackbar(t('Fehler beim Aktualisieren der Baugruppe', 'Could not update assembly'), 'error'),
            },
        );
    }

    function handleDeleteConfirm() {
        if (!deletingId) return;
        deleteAssembly.mutate(deletingId, {
            onSuccess: () => {
                setDeletingId(undefined);
                showSnackbar(t('Baugruppe gelöscht', 'Assembly deleted'), 'success');
            },
            onError: () => showSnackbar(t('Fehler beim Löschen der Baugruppe', 'Could not delete assembly'), 'error'),
        });
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4">{t('Baugruppen', 'Assemblies')}</Typography>
                <TooltipButton
                    tooltipText={t('Eine neue Baugruppe erstellen', 'Create a new assembly')}
                    icon={<AddIcon />}
                    label={t('Baugruppe hinzufügen', 'Add assembly')}
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
                <DialogTitle>{t('Neue Baugruppe erstellen', 'Create new assembly')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <AssemblyForm items={items ?? []} onSubmit={handleCreate} isLoading={createAssembly.isPending} />
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={!!editingAssembly} onClose={() => setEditingAssembly(undefined)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('Baugruppe bearbeiten', 'Edit assembly')}</DialogTitle>
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
                <DialogTitle>{t('Baugruppe löschen', 'Delete assembly')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('Sind Sie sicher, dass Sie diese Baugruppe löschen möchten? Dies kann nicht rückgängig gemacht werden.', 'Are you sure you want to delete this assembly? This cannot be undone.')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Tooltip title={t('Löschvorgang abbrechen', 'Cancel deletion')} arrow>
                        <Button onClick={() => setDeletingId(undefined)}>{t('Abbrechen', 'Cancel')}</Button>
                    </Tooltip>
                    <Tooltip title={t('Diese Baugruppe dauerhaft löschen', 'Permanently delete this assembly')} arrow>
                        <Button onClick={handleDeleteConfirm} color="error" variant="contained">
                            {t('Löschen', 'Delete')}
                        </Button>
                    </Tooltip>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
