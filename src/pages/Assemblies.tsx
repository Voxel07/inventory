import { FormDialog } from '../components/shared/FormDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { ActionBar } from '../components/shared/ActionBar';
import { useState } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useCompactCatalog } from '../hooks/useCompactCatalog';
import { Box } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { AssemblyForm } from '../components/forms/AssemblyForm';
import { AssembliesList } from '../components/lists/AssembliesList';
import { CatalogScopeToggle } from '../components/lists/CatalogParts';
import { CsvImportDialog } from '../components/dialogs/CsvImportDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { usePagedAssemblies, useCreateAssembly, useUpdateAssembly, useDeleteAssembly, useDeleteAssemblies } from '../hooks/useAssemblies';
import { useCrudManager } from '../hooks/useCrudManager';
import type { Assembly, AssemblyFormData } from '../types';
import { useT } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canCreateInventory, canEditCatalog } from '../utils/access';

export function Assemblies() {
    const { user } = useAuth();
    const catalogManager = canEditCatalog(user);
    const canCreate = canCreateInventory(user);
    const t = useT();
    const compact = useCompactCatalog();
    const [params] = useSearchParams();
    const mine = params.get('scope') === 'mine';
    const [search, setSearch] = useState('');
    const assemblies = usePagedAssemblies({ search: useDebouncedValue(search.trim()) || undefined, mine: mine || undefined });

    const createAssembly = useCreateAssembly();
    const updateAssembly = useUpdateAssembly();
    const deleteAssembly = useDeleteAssembly();
    const deleteAssemblies = useDeleteAssemblies();

    const crud = useCrudManager<Assembly, AssemblyFormData>(
        { create: createAssembly, update: updateAssembly, delete: deleteAssembly, deleteMany: deleteAssemblies },
        { entityName: t('pages.assemblies.assembly'), entityNamePlural: t('pages.assemblies.assemblies') },
    );

    const [importOpen, setImportOpen] = useState(false);

    return (
        <Box>
            <PageHeader
                title={t('nav.assemblies')}
                inlineActions={compact}
                actions={<ActionBar iconOnly={compact} actions={[
                    catalogManager && { key: 'import', label: t('pages.assemblies.importCSV'), icon: <FileUploadIcon />, onClick: () => setImportOpen(true) },
                    canCreate && { key: 'create', label: t('pages.assemblies.addAssembly'), icon: <AddIcon />, variant: 'contained', pinned: true, onClick: crud.openCreate },
                ]} />}
            />
            <AssembliesList
                assemblies={assemblies.data}
                scope={<CatalogScopeToggle allLabel={t('pages.assemblies.allAssemblies')} mineLabel={t('pages.assemblies.myAssemblies')} />}
                search={search}
                onSearch={setSearch}
                list={assemblies}
                isLoading={assemblies.isLoading}
                loadError={assemblies.isError}
                onRetry={() => { void assemblies.refetch(); }}
                onCreate={canCreate ? crud.openCreate : undefined}
                onEdit={crud.openEdit}
                onDelete={crud.openDelete}
                onDeleteMany={crud.openDeleteMany}
                emptyHint={mine ? t('pages.assemblies.youDoNotOwnAnyAssembliesYet') : undefined}
            />

            <FormDialog open={crud.formOpen} onClose={crud.closeForm}>
                <AssemblyForm
                    key={crud.editingEntity?.id ?? 'create'}
                    title={crud.editingEntity ? t('pages.assemblies.editAssembly') : t('pages.assemblies.newAssembly')}
                    onCancel={crud.closeForm}
                    initialData={crud.editingEntity}
                    onSubmit={crud.handleSave}
                    isLoading={createAssembly.isPending || updateAssembly.isPending}
                />
            </FormDialog>

            {/* Delete Confirmation */}
            <ConfirmDialog
                open={crud.isDeleteOpen}
                title={crud.deletingIds.length > 1
                    ? t('pages.assemblies.retireAssemblies')
                    : t('pages.assemblies.retireAssembly')}
                message={t('pages.assemblies.retireConfirmation', { count: crud.deletingIds.length })}
                actionLabel={t('common.retire')}
                actionTooltip={t('pages.assemblies.removeFromTheCatalogAndKeepHistory')}
                actionColor="error"
                onClose={crud.closeDelete}
                onConfirm={crud.handleDeleteConfirm}
                pending={deleteAssembly.isPending || deleteAssemblies.isPending}
            />

            {/* CSV Import Dialog */}
            <CsvImportDialog
                open={importOpen}
                initialType="assemblies"
                onClose={() => setImportOpen(false)}
            />
        </Box>
    );
}
