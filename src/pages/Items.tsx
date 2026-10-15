import { FormDialog } from '../components/shared/FormDialog';
import { useState } from 'react';
import { Box, ToggleButtonGroup } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { ItemForm } from '../components/forms/ItemForm';
import { ItemsList } from '../components/lists/ItemsList';
import { QrLabelDialog } from '../components/qr/QrLabelDialog';
import { CsvImportDialog } from '../components/dialogs/CsvImportDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { Button, ToggleButton } from '../components/shared/ActionButtons';
import { usePagedItems, useItemCategories, useCreateItem, useUpdateItem, useDeleteItem, useDeleteItems, type ItemQuery } from '../hooks/useItems';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
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
    const [params, setParams] = useSearchParams();
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
                actions={<>
                    {catalogManager && <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={() => setImportOpen(true)}>
                        {t('pages.items.importCSV')}
                    </Button>}
                    {canCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
                        {t('common.addItem')}
                    </Button>}
                </>}
            />
            <ToggleButtonGroup exclusive size="small" value={mine ? 'mine' : 'all'} sx={{ mb: 2 }} aria-label={t('common.scope')}
                onChange={(_, value: string | null) => { if (value) setParams((current) => { if (value === 'mine') current.set('scope', 'mine'); else current.delete('scope'); return current; }, { replace: true }); }}>
                <ToggleButton value="all">{t('pages.items.allItems')}</ToggleButton>
                <ToggleButton value="mine">{t('pages.items.myItems')}</ToggleButton>
            </ToggleButtonGroup>

            <ItemsList
                items={catalog.data}
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
