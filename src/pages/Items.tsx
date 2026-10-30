import { FormDialog } from '../components/shared/FormDialog';
import { useState } from 'react';
import { Box } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { ItemForm } from '../components/forms/ItemForm';
import { ItemsList } from '../components/lists/ItemsList';
import { CatalogScopeToggle } from '../components/lists/CatalogParts';
import { QrLabelDialog } from '../components/qr/QrLabelDialog';
import { CsvImportDialog } from '../components/dialogs/CsvImportDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { ActionBar } from '../components/shared/ActionBar';
import { usePagedItems, useItemCategories, useCreateItem, useUpdateItem, useDeleteItem, useDeleteItems, type ItemQuery } from '../hooks/useItems';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useCompactCatalog } from '../hooks/useCompactCatalog';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useCrudManager } from '../hooks/useCrudManager';
import type { Item, ItemFormData } from '../types';
import { useT } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canCreateInventory, canEditCatalog } from '../utils/access';

export function Items() {
    const { user } = useAuth();
    const catalogManager = canEditCatalog(user);
    const canCreate = canCreateInventory(user);
    const t = useT();
    const compact = useCompactCatalog();
    const [params] = useSearchParams();
    const mine = params.get('scope') === 'mine';
    // Search, filters and the "mine" scope run on the server; further pages load on demand.
    const [query, setQuery] = useState<ItemQuery>({});
    const debouncedSearch = useDebouncedValue(query.search);
    const catalog = usePagedItems({ ...query, search: debouncedSearch, mine: mine || undefined });
    const { data: storageLocations } = useStorageLocations();
    const { data: categories = [] } = useItemCategories();

    const createItem = useCreateItem();
    const updateItem = useUpdateItem();
    const deleteItem = useDeleteItem();
    const deleteItems = useDeleteItems();

    const crud = useCrudManager<Item, ItemFormData>(
        { create: createItem, update: updateItem, delete: deleteItem, deleteMany: deleteItems },
        { entityName: t('pages.items.item'), entityNamePlural: t('common.items') },
    );

    const [importOpen, setImportOpen] = useState(false);
    const [qrItem, setQrItem] = useState<Item | undefined>();


    return (
        <Box>
            <PageHeader
                title={t('nav.items')}
                inlineActions={compact}
                actions={<ActionBar iconOnly={compact} actions={[
                    catalogManager && { key: 'import', label: t('pages.items.importCSV'), icon: <FileUploadIcon />, onClick: () => setImportOpen(true) },
                    canCreate && { key: 'create', label: t('common.addItem'), icon: <AddIcon />, variant: 'contained', pinned: true, onClick: crud.openCreate },
                ]} />}
            />
            <ItemsList
                items={catalog.data}
                scope={<CatalogScopeToggle allLabel={t('pages.items.allItems')} mineLabel={t('pages.items.myItems')} />}
                server={{ query, onQueryChange: setQuery, list: catalog }}
                isLoading={catalog.isLoading}
                loadError={catalog.isError}
                onRetry={() => { void catalog.refetch(); }}
                onCreate={canCreate ? crud.openCreate : undefined}
                onEdit={crud.openEdit}
                onDelete={crud.openDelete}
                onDeleteMany={crud.openDeleteMany}
                emptyHint={mine ? t('pages.items.nothingIsAssignedToYouOrCheckedOutToYou') : undefined}
            />

            <FormDialog open={crud.formOpen} onClose={crud.closeForm}>
                <ItemForm
                    key={crud.editingEntity?.id ?? 'create'}
                    title={crud.editingEntity ? t('pages.items.editItem') : t('pages.items.newItem')}
                    onCancel={crud.closeForm}
                    initialData={crud.editingEntity}
                    onSubmit={crud.handleSave}
                    isLoading={createItem.isPending || updateItem.isPending}
                    storageLocations={storageLocations ?? []}
                    categories={categories}
                />
            </FormDialog>

            <QrLabelDialog label={qrItem ? { title: t('pages.items.qRCode'), itemId: qrItem.id, itemName: qrItem.name } : null}
                onClose={() => setQrItem(undefined)} />

            <ConfirmDialog
                open={crud.isDeleteOpen}
                title={crud.deletingIds.length > 1 ? t('pages.items.retireItems') : t('pages.items.retireItem')}
                message={t('pages.items.retireDeletingIdCountItemSTheyLeaveTheCatalogTheirCodes', { deletingIdCount: String(crud.deletingIds.length) })}
                actionLabel={t('common.retire')}
                actionTooltip={t('pages.items.removeFromTheCatalogAndKeepHistory')}
                actionColor="error"
                onClose={crud.closeDelete}
                onConfirm={crud.handleDeleteConfirm}
                pending={deleteItem.isPending || deleteItems.isPending}
            />

            <CsvImportDialog
                open={importOpen}
                initialType="items"
                onClose={() => setImportOpen(false)}
            />
        </Box>
    );
}
