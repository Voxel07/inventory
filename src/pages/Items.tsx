import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import { Box, Typography, DialogTitle, DialogContent, useMediaQuery, useTheme } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { ItemForm } from '../components/forms/ItemForm';
import { ItemsList } from '../components/lists/ItemsList';
import { QRCodeGenerator } from '../components/qr/QRCodeGenerator';
import { CsvImportDialog } from '../components/dialogs/CsvImportDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { useItems, useCreateItem, useUpdateItem, useDeleteItem, useDeleteItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useAssignableUsers } from '../hooks/useUsers';
import { useCrudManager } from '../hooks/useCrudManager';
import { TooltipButton } from '../components/shared/TooltipButton';
import type { Item, ItemFormData } from '../types';
import { useLocalizedText } from '../utils/naming';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog } from '../utils/access';
import { ReadOnlyCatalogList } from '../components/lists/ReadOnlyCatalogList';
import { getItemStock } from '../utils/stock';

export function Items() {
    const { user } = useAuth();
    return canEditCatalog(user) ? <ManagedItems /> : <ReadOnlyItems />;
}

function ReadOnlyItems() {
    const t = useLocalizedText();
    const { data: items = [], isLoading, isError, hasNextPage, isFetchingNextPage, refetch } = useItems();
    return <ReadOnlyCatalogList title={t('Artikel', 'Items')} entries={items.map((item) => {
        const stock = getItemStock(item);
        return { id: item.id, name: item.name, subtitle: [item.category, item.subcategory, item.sku].filter(Boolean).join(' · '),
            description: item.description, available: stock.remaining, total: stock.totalStock,
            details: [item.hint, item.expand?.storageLocation?.name].filter((value): value is string => Boolean(value)) };
    })} isLoading={isLoading} isError={isError} loadingMore={hasNextPage || isFetchingNextPage} onRetry={() => { void refetch(); }} />;
}

function ManagedItems() {
    const t = useLocalizedText();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { data: items, isLoading, isFetchingNextPage, hasNextPage, isError, refetch, isComplete: itemsComplete } = useItems();
    const { data: assemblies, isComplete: assembliesComplete, isError: assembliesError } = useAssemblies();
    const { data: storageLocations } = useStorageLocations();
    const { data: assignableUsers } = useAssignableUsers();

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

    const categories = [...new Set(items?.map((i) => i.category).filter(Boolean) ?? [])];
    const allNames = items?.map((i) => i.name) ?? [];

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 1 }}>
                <Typography variant="h4">{t('Artikel', 'Items')}</Typography>
                <Box sx={{ display: 'flex', gap: { xs: 0.25, sm: 1 }, flexShrink: 0 }}>
                    <TooltipButton
                        tooltipText={t('Artikel und Baugruppen aus CSV importieren', 'Import items and assemblies from CSV')}
                        icon={<FileUploadIcon />}
                        label={isMobile ? undefined : t('CSV Import', 'CSV import')}
                        variant={isMobile ? 'icon' : 'outlined'}
                        onClick={() => setImportOpen(true)}
                    />
                    <TooltipButton
                        tooltipText={t('Neuen Inventarartikel erstellen', 'Create a new inventory item')}
                        icon={<AddIcon />}
                        label={isMobile ? undefined : t('Artikel hinzufügen', 'Add item')}
                        variant={isMobile ? 'icon' : 'contained'}
                        onClick={crud.openCreate}
                    />
                </Box>
            </Box>

            <ItemsList
                items={items}
                isLoading={isLoading}
                loadingMore={!isError && (hasNextPage || isFetchingNextPage)}
                loadError={isError}
                onRetry={() => { void refetch(); }}
                onEdit={crud.openEdit}
                onDelete={crud.openDelete}
                onDeleteMany={crud.openDeleteMany}
            />

            {/* Create Dialog */}
            <Dialog open={crud.isCreateOpen} onClose={crud.closeCreate} maxWidth="sm" fullWidth fullScreen={isMobile}>
                <DialogTitle>{t('Neuen Artikel erstellen', 'Create new item')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    <ItemForm
                        onSubmit={crud.handleCreate}
                        isLoading={createItem.isPending}
                        storageLocations={storageLocations ?? []}
                        categories={categories}
                        existingNames={allNames}
                        assignableUsers={assignableUsers ?? []}
                    />
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={crud.isEditOpen} onClose={crud.closeEdit} maxWidth="sm" fullWidth fullScreen={isMobile}>
                <DialogTitle>{t('Artikel bearbeiten', 'Edit item')}</DialogTitle>
                <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
                    {crud.editingEntity && (
                        <ItemForm
                            initialData={crud.editingEntity}
                            onSubmit={crud.handleUpdate}
                            isLoading={updateItem.isPending}
                            storageLocations={storageLocations ?? []}
                            categories={categories}
                            existingNames={allNames.filter((n) => n !== crud.editingEntity?.name)}
                            assignableUsers={assignableUsers ?? []}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* QR Code Dialog */}
            <Dialog open={!!qrItem} onClose={() => setQrItem(undefined)} maxWidth="xs" fullWidth>
                <DialogTitle>QR-Code</DialogTitle>
                <DialogContent>
                    {qrItem && <QRCodeGenerator itemId={qrItem.id} itemName={qrItem.name} />}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
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

            {/* CSV Import Dialog */}
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
