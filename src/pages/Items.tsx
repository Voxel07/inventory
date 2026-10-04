import { FormDialog } from '../components/shared/FormDialog';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import { Box, DialogTitle, DialogContent, ToggleButtonGroup } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { ItemForm } from '../components/forms/ItemForm';
import { ItemsList } from '../components/lists/ItemsList';
import { QRCodeGenerator } from '../components/qr/QRCodeGenerator';
import { CsvImportDialog } from '../components/dialogs/CsvImportDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { Button, ToggleButton } from '../components/shared/ActionButtons';
import { useItems, useCreateItem, useUpdateItem, useDeleteItem, useDeleteItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useAssignableUsers } from '../hooks/useUsers';
import { useCrudManager } from '../hooks/useCrudManager';
import { useMember } from '../hooks/useMember';
import type { Item, ItemFormData } from '../types';
import { useLocalizedText } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { personalItems } from '../utils/personalItems';
import { canEditCatalog } from '../utils/access';

export function Items() {
    const { user } = useAuth();
    const catalogManager = canEditCatalog(user);
    const t = useLocalizedText();
    const [params, setParams] = useSearchParams();
    const mine = params.get('scope') === 'mine';
    const { data: items, isLoading, isFetchingNextPage, hasNextPage, isError, refetch, isComplete: itemsComplete } = useItems();
    const { data: assemblies, isComplete: assembliesComplete, isError: assembliesError } = useAssemblies();
    const { data: storageLocations } = useStorageLocations();
    const { data: assignableUsers } = useAssignableUsers(catalogManager);
    const { custody } = useMember();

    const createItem = useCreateItem();
    const updateItem = useUpdateItem();
    const deleteItem = useDeleteItem();
    const deleteItems = useDeleteItems();

    const crud = useCrudManager<Item, ItemFormData>(
        { create: createItem, update: updateItem, delete: deleteItem, deleteMany: deleteItems },
        { entityName: 'Artikel', entityNameEnglish: 'item', entityNamePlural: 'Artikel', entityNamePluralEnglish: 'items' },
    );

    const [importOpen, setImportOpen] = useState(false);
    const [qrItem, setQrItem] = useState<Item | undefined>();

    const visibleItems = mine && items ? personalItems(items, user?.id, custody.data ?? []) : items;
    const categories = [...new Set(items?.map((i) => i.category).filter(Boolean) ?? [])];
    const allNames = items?.map((i) => i.name) ?? [];

    return (
        <Box>
            <PageHeader
                title={t('Artikel', 'Items')}
                actions={<>
                    {catalogManager && <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={() => setImportOpen(true)}>
                        {t('CSV-Import', 'Import CSV')}
                    </Button>}
                    <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
                        {t('Artikel hinzufügen', 'Add item')}
                    </Button>
                </>}
            />
            <ToggleButtonGroup exclusive size="small" value={mine ? 'mine' : 'all'} sx={{ mb: 2 }} aria-label={t('Umfang', 'Scope')}
                onChange={(_, value: string | null) => { if (value) setParams((current) => { if (value === 'mine') current.set('scope', 'mine'); else current.delete('scope'); return current; }, { replace: true }); }}>
                <ToggleButton value="all">{t('Alle Artikel', 'All items')}</ToggleButton>
                <ToggleButton value="mine">{t('Meine Artikel', 'My items')}</ToggleButton>
            </ToggleButtonGroup>

            <ItemsList
                items={visibleItems}
                isLoading={isLoading || (mine && custody.isLoading)}
                loadingMore={!isError && (hasNextPage || isFetchingNextPage)}
                loadError={isError}
                onRetry={() => { void refetch(); }}
                onCreate={crud.openCreate}
                onEdit={crud.openEdit}
                onDelete={crud.openDelete}
                onDeleteMany={crud.openDeleteMany}
                emptyHint={mine ? t('Dir sind derzeit keine Artikel zugeordnet und du hast keine ausgeliehen.', 'Nothing is assigned to you or checked out to you right now.') : undefined}
            />

            <FormDialog open={crud.formOpen} onClose={crud.closeForm}>
                <ItemForm
                    key={crud.editingEntity?.id ?? 'create'}
                    title={crud.editingEntity ? t('Artikel bearbeiten', 'Edit item') : t('Neuer Artikel', 'New item')}
                    onCancel={crud.closeForm}
                    initialData={crud.editingEntity}
                    onSubmit={crud.handleSave}
                    isLoading={createItem.isPending || updateItem.isPending}
                    storageLocations={storageLocations ?? []}
                    categories={categories}
                    existingNames={allNames.filter((name) => name !== crud.editingEntity?.name)}
                    assignableUsers={assignableUsers ?? []}
                />
            </FormDialog>

            <Dialog open={!!qrItem} onClose={() => setQrItem(undefined)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('QR-Code', 'QR code')}</DialogTitle>
                <DialogContent>
                    {qrItem && <QRCodeGenerator itemId={qrItem.id} itemName={qrItem.name} />}
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={crud.isDeleteOpen}
                title={t('Artikel löschen', crud.deletingIds.length > 1 ? 'Delete items' : 'Delete item')}
                message={t(
                    `Sind Sie sicher, dass Sie ${crud.deletingIds.length} Artikel einschließlich des zugehörigen Transaktionsverlaufs löschen möchten? Dies kann nicht rückgängig gemacht werden.`,
                    `Are you sure you want to delete ${crud.deletingIds.length} item(s), including their transaction history? This cannot be undone.`,
                )}
                actionLabel={t('Löschen', 'Delete')}
                actionTooltip={t('Dauerhaft löschen', 'Permanently delete')}
                actionColor="error"
                onClose={crud.closeDelete}
                onConfirm={crud.handleDeleteConfirm}
                pending={deleteItem.isPending || deleteItems.isPending}
            />

            <CsvImportDialog
                open={importOpen}
                onClose={() => setImportOpen(false)}
                items={items ?? []}
                assemblies={assemblies ?? []}
                storageLocations={storageLocations ?? []}
                catalogComplete={itemsComplete && assembliesComplete && !isError && !assembliesError && !!items && !!assemblies}
            />
        </Box>
    );
}
