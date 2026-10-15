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
import { useLocalizedText } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canCreateInventory, canEditCatalog } from '../utils/access';

export function Items() {
    const { user } = useAuth();
    const catalogManager = canEditCatalog(user);
    const canCreate = canCreateInventory(user);
    const t = useLocalizedText();
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
        { entityName: 'Artikel', entityNameEnglish: 'item', entityNamePlural: 'Artikel', entityNamePluralEnglish: 'items' },
    );

    const [importOpen, setImportOpen] = useState(false);
    const [qrItem, setQrItem] = useState<Item | undefined>();


    return (
        <Box>
            <PageHeader
                title={t('Artikel', 'Items')}
                actions={<>
                    {catalogManager && <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={() => setImportOpen(true)}>
                        {t('CSV-Import', 'Import CSV')}
                    </Button>}
                    {canCreate && <Button variant="contained" startIcon={<AddIcon />} onClick={crud.openCreate}>
                        {t('Artikel hinzufügen', 'Add item')}
                    </Button>}
                </>}
            />
            <ToggleButtonGroup exclusive size="small" value={mine ? 'mine' : 'all'} sx={{ mb: 2 }} aria-label={t('Umfang', 'Scope')}
                onChange={(_, value: string | null) => { if (value) setParams((current) => { if (value === 'mine') current.set('scope', 'mine'); else current.delete('scope'); return current; }, { replace: true }); }}>
                <ToggleButton value="all">{t('Alle Artikel', 'All items')}</ToggleButton>
                <ToggleButton value="mine">{t('Meine Artikel', 'My items')}</ToggleButton>
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
                />
            </FormDialog>

            <QrLabelDialog label={qrItem ? { title: t('QR-Code', 'QR code'), itemId: qrItem.id, itemName: qrItem.name } : null}
                onClose={() => setQrItem(undefined)} />

            <ConfirmDialog
                open={crud.isDeleteOpen}
                title={t('Artikel stilllegen', crud.deletingIds.length > 1 ? 'Retire items' : 'Retire item')}
                message={t(
                    `${crud.deletingIds.length} Artikel stilllegen? Sie verschwinden aus dem Katalog; Codes und Verlauf bleiben erhalten.`,
                    `Retire ${crud.deletingIds.length} item(s)? They leave the catalog; their codes and history are kept.`,
                )}
                actionLabel={t('Stilllegen', 'Retire')}
                actionTooltip={t('Aus dem Katalog entfernen, Verlauf behalten', 'Remove from the catalog and keep history')}
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
