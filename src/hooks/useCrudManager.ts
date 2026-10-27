import { useState } from 'react';
import { useMutationFeedback } from './useMutationFeedback';
import { useT } from '../utils/naming';

interface MutationLike<TArgs> {
  mutate: (args: TArgs, options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => void;
  isPending?: boolean;
}

interface CrudMutations<TForm> {
  create: MutationLike<TForm>;
  update: MutationLike<{ id: string; data: Partial<TForm> }>;
  delete: MutationLike<string>;
  deleteMany?: MutationLike<string[]>;
}

interface CrudManagerOptions {
  entityName: string;
  entityNamePlural?: string;
  createSuccessMessage?: string;
  updateSuccessMessage?: string;
  deleteSuccessMessage?: string;
}

export function useCrudManager<T extends { id: string }, TForm>(
  mutations: CrudMutations<TForm>,
  options: CrudManagerOptions,
) {
  const t = useT();
  const feedback = useMutationFeedback();
  const entityNamePlural = options.entityNamePlural ?? options.entityName;

  const [formOpen, setFormOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<T | undefined>();
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  const openCreate = () => {
    setEditingEntity(undefined);
    setFormOpen(true);
  };

  const openEdit = (entity: T) => {
    setEditingEntity(entity);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingEntity(undefined);
  };

  const openDelete = (id: string) => {
    setDeletingIds([id]);
  };

  const openDeleteMany = (ids: string[]) => {
    setDeletingIds(ids);
  };

  const closeDelete = () => {
    setDeletingIds([]);
  };

  const handleCreate = (data: TForm) => {
    mutations.create.mutate(data, {
      onSuccess: () => {
        closeForm();
        feedback.success(options.createSuccessMessage ??
            t('hooks.useCrudManager.entityNameCreatedSuccessfully', { entityName: String(options.entityName) }));
      },
      onError: () =>
        feedback.failure(t('hooks.useCrudManager.couldNotCreateEntityName', { entityName: String(options.entityName) })),
    });
  };

  const handleUpdate = (data: TForm) => {
    if (!editingEntity) return;
    mutations.update.mutate(
      { id: editingEntity.id, data },
      {
        onSuccess: () => {
          closeForm();
          feedback.success(options.updateSuccessMessage ??
              t('hooks.useCrudManager.entityNameUpdatedSuccessfully', { entityName: String(options.entityName) }));
        },
        onError: () =>
          feedback.failure(t('hooks.useCrudManager.couldNotUpdateEntityName', { entityName: String(options.entityName) })),
      },
    );
  };

  const handleSave = (data: TForm) => {
    if (editingEntity) {
      handleUpdate(data);
    } else {
      handleCreate(data);
    }
  };

  const handleDeleteConfirm = () => {
    if (!deletingIds.length) return;
    if (deletingIds.length === 1 || !mutations.deleteMany) {
      mutations.delete.mutate(deletingIds[0], {
        onSuccess: () => {
          setDeletingIds([]);
          feedback.success(options.deleteSuccessMessage ??
              t('hooks.useCrudManager.entityNameDeleted', { entityName: String(options.entityName) }));
        },
        onError: () =>
          feedback.failure(t('hooks.useCrudManager.couldNotDeleteEntityName', { entityName: String(options.entityName) })),
      });
    } else {
      mutations.deleteMany.mutate(deletingIds, {
        onSuccess: () => {
          const count = deletingIds.length;
          setDeletingIds([]);
          feedback.success(t('hooks.useCrudManager.countEntityNamePluralDeleted', { count: count, entityNamePlural: entityNamePlural }));
        },
        onError: () =>
          feedback.failure(t('hooks.useCrudManager.couldNotDeleteEntityNamePlural', { entityNamePlural: entityNamePlural })),
      });
    }
  };

  return {
    formOpen,
    editingEntity,
    deletingIds,
    isDeleteOpen: deletingIds.length > 0,
    openCreate,
    openEdit,
    closeForm,
    openDelete,
    openDeleteMany,
    closeDelete,
    handleSave,
    handleDeleteConfirm,
  };
}
