import { useState } from 'react';
import { Box, Typography, Dialog, DialogTitle, DialogContent, useTheme, useMediaQuery } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { AssembliesList } from '../components/lists/AssembliesList';
import { CsvImportDialog } from '../components/dialogs/CsvImportDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useAssemblies, useCreateAssembly, useUpdateAssembly, useDeleteAssembly, useDeleteAssemblies } from '../hooks/useAssemblies';
import { useItems } from '../hooks/useItems';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useCrudManager } from '../hooks/useCrudManager';
import { TooltipButton } from '../components/shared/TooltipButton';
import type { Assembly, AssemblyFormData } from '../types';
import { useLocalizedText } from '../utils/naming';

export function Assemblies() {
    const t = useLocalizedText();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { data: assemblies, isLoading } = useAssemblies();
    const { data: items } = useItems();
    const { data: storageLocations } = useStorageLocations();

    const createAssembly = useCreateAssembly();
    const updateAssembly = useUpdateAssembly();
    const deleteAssembly = useDeleteAssembly();
    const deleteAssemblies = useDeleteAssemblies();

    const crud = useCrudManager<Assembly, AssemblyFormData>(
        { create: createAssembly, update: updateAssembly, delete: deleteAssembly, deleteMany: deleteAssemblies },
        { entityName: 'Baugruppe', entityNameEnglish: 'assembly', entityNamePlural: 'Baugruppen', entityNamePluralEnglish: 'assemblies' },
    );

    const [importOpen, setImportOpen] = useState(false);

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="h4">{t('Baugruppen', 'Assemblies')}</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TooltipButton
                        tooltipText={t('Baugruppen und Artikel aus CSV importieren', 'Import assemblies and items from CSV')}
                        icon={<FileUploadIcon />}
                        label={t('CSV Import', 'CSV import')}
                        variant="outlined"
                        onClick={() => setImportOpen(true)}
                    />
                    <TooltipButton
                        tooltipText={t('Eine neue Baugruppe erstellen', 'Create a new assembly')}
                        icon={<AddIcon />}
                        label={t('Baugruppe hinzufügen', 'Add assembly')}
                        variant="contained"
                        onClick={crud.openCreate}
                    />
                </Box>
            </Box>

            <AssembliesList
                assemblies={assemblies}
                items={items}
                isLoading={isLoading}
                onEdit={crud.openEdit}
                onDelete={crud.openDelete}
                onDeleteMany={crud.openDeleteMany}
            />

            {/* Create Dialog */}
            <Dialog open={crud.formOpen && !crud.editingEntity} fullScreen={isMobile} onClose={crud.closeForm} maxWidth="sm" fullWidth>
                <DialogTitle>{t('Neue Baugruppe erstellen', 'Create new assembly')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <AssemblyForm items={items ?? []} onSubmit={crud.handleSave} isLoading={createAssembly.isPending} />
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={Boolean(crud.editingEntity)} fullScreen={isMobile} onClose={crud.closeForm} maxWidth="sm" fullWidth>
                <DialogTitle>{t('Baugruppe bearbeiten', 'Edit assembly')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {crud.editingEntity && (
                        <AssemblyForm
                            initialData={crud.editingEntity}
                            items={items ?? []}
                            onSubmit={crud.handleSave}
                            isLoading={updateAssembly.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={crud.isDeleteOpen}
                title={crud.deletingIds.length > 1
                    ? t('Baugruppen löschen', 'Delete assemblies')
                    : t('Baugruppe löschen', 'Delete assembly')}
                message={t(
                    `Sind Sie sicher, dass Sie ${crud.deletingIds.length} ${crud.deletingIds.length === 1 ? 'Baugruppe' : 'Baugruppen'} löschen möchten? Dies kann nicht rückgängig gemacht werden.`,
                    `Are you sure you want to delete ${crud.deletingIds.length} assembl${crud.deletingIds.length === 1 ? 'y' : 'ies'}? This cannot be undone.`,
                )}
                actionLabel={t('Löschen', 'Delete')}
                actionTooltip={t('Dauerhaft löschen', 'Permanently delete')}
                actionColor="error"
                onClose={crud.closeDelete}
                onConfirm={crud.handleDeleteConfirm}
                pending={deleteAssembly.isPending || deleteAssemblies.isPending}
            />

            {/* CSV Import Dialog */}
            <CsvImportDialog
                open={importOpen}
                onClose={() => setImportOpen(false)}
                items={items ?? []}
                assemblies={assemblies ?? []}
                storageLocations={storageLocations ?? []}
            />
        </Box>
    );
}
