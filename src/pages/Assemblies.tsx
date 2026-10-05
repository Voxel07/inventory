import { FormDialog } from '../components/shared/FormDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { Button, ToggleButton } from '../components/shared/ActionButtons';
import { useState } from 'react';
import { Box, ToggleButtonGroup } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
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
import type { Assembly, AssemblyFormData } from '../types';
import { useLocalizedText } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog } from '../utils/access';
import { personalAssemblies } from '../utils/personalItems';

export function Assemblies() {
    const { user } = useAuth();
    const catalogManager = canEditCatalog(user);
    const t = useLocalizedText();
    const [params, setParams] = useSearchParams();
    const mine = params.get('scope') === 'mine';
    const { data: assemblies, isLoading, isFetchingNextPage, hasNextPage, isError, refetch, isComplete: assembliesComplete } = useAssemblies();
    const { data: items, isComplete: itemsComplete, isError: itemsError } = useItems();
    const { data: storageLocations } = useStorageLocations();
    const visibleAssemblies = mine && assemblies ? personalAssemblies(assemblies, user?.id) : assemblies;

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
            <PageHeader
                title={t('Baugruppen', 'Assemblies')}
                actions={<>
                    {catalogManager && <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={() => setImportOpen(true)}>{t('CSV-Import', 'Import CSV')}</Button>}
                    <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>{t('Baugruppe hinzufügen', 'Add assembly')}</Button>
                </>}
            />
            <ToggleButtonGroup exclusive size="small" value={mine ? 'mine' : 'all'} sx={{ mb: 2 }} aria-label={t('Umfang', 'Scope')}
                onChange={(_, value: string | null) => { if (value) setParams((current) => { if (value === 'mine') current.set('scope', 'mine'); else current.delete('scope'); return current; }, { replace: true }); }}>
                <ToggleButton value="all">{t('Alle Baugruppen', 'All assemblies')}</ToggleButton>
                <ToggleButton value="mine">{t('Meine Baugruppen', 'My assemblies')}</ToggleButton>
            </ToggleButtonGroup>

            <AssembliesList
                assemblies={visibleAssemblies}
                items={items}
                isLoading={isLoading}
                loadingMore={!isError && (hasNextPage || isFetchingNextPage)}
                loadError={isError}
                onRetry={() => { void refetch(); }}
                onCreate={crud.openCreate}
                onEdit={crud.openEdit}
                onDelete={crud.openDelete}
                onDeleteMany={crud.openDeleteMany}
                emptyHint={mine ? t('Du hast noch keine eigenen Baugruppen.', 'You do not own any assemblies yet.') : undefined}
            />

            <FormDialog open={crud.formOpen} onClose={crud.closeForm}>
                <AssemblyForm
                    key={crud.editingEntity?.id ?? 'create'}
                    title={crud.editingEntity ? t('Baugruppe bearbeiten', 'Edit assembly') : t('Neue Baugruppe', 'New assembly')}
                    onCancel={crud.closeForm}
                    initialData={crud.editingEntity}
                    items={items ?? []}
                    onSubmit={crud.handleSave}
                    isLoading={createAssembly.isPending || updateAssembly.isPending}
                />
            </FormDialog>

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
                catalogComplete={itemsComplete && assembliesComplete && !isError && !itemsError && !!items && !!assemblies}
            />
        </Box>
    );
}
