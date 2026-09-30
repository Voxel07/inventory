import { useState } from 'react';
import { useMutationFeedback } from './useMutationFeedback';
import { useLocalizedText } from '../utils/naming';

export interface MutationLike<TArgs> {
  mutate: (args: TArgs, options?: { onSuccess?: () => void; onError?: (error: unknown) => void }) => void;
  isPending?: boolean;
}

export interface CrudMutations<TForm> {
  create: MutationLike<TForm>;
  update: MutationLike<{ id: string; data: Partial<TForm> }>;
  delete: MutationLike<string>;
  deleteMany?: MutationLike<string[]>;
}

export interface CrudManagerOptions {
  entityName: string;
  entityNameEnglish?: string;
  entityNamePlural?: string;
  entityNamePluralEnglish?: string;
  createSuccessMessage?: string;
  updateSuccessMessage?: string;
  deleteSuccessMessage?: string;
}

export function useCrudManager<T extends { id: string }, TForm>(
  mutations: CrudMutations<TForm>,
  options: CrudManagerOptions,
) {
  const t = useLocalizedText();
  const feedback = useMutationFeedback();
  const entityNameEnglish = options.entityNameEnglish ?? options.entityName;
  const entityNamePlural = options.entityNamePlural ?? options.entityName;
  const entityNamePluralEnglish = options.entityNamePluralEnglish ?? entityNameEnglish;

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
            t(`${options.entityName} erfolgreich erstellt`, `${entityNameEnglish} created successfully`));
      },
      onError: () =>
        feedback.failure(t(`Fehler beim Erstellen von ${options.entityName}`, `Could not create ${entityNameEnglish}`)),
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
              t(`${options.entityName} erfolgreich aktualisiert`, `${entityNameEnglish} updated successfully`));
        },
        onError: () =>
          feedback.failure(t(`Fehler beim Aktualisieren von ${options.entityName}`, `Could not update ${entityNameEnglish}`)),
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
              t(`${options.entityName} gelöscht`, `${entityNameEnglish} deleted`));
        },
        onError: () =>
          feedback.failure(t(`Fehler beim Löschen von ${options.entityName}`, `Could not delete ${entityNameEnglish}`)),
      });
    } else {
      mutations.deleteMany.mutate(deletingIds, {
        onSuccess: () => {
          const count = deletingIds.length;
          setDeletingIds([]);
          feedback.success(t(`${count} ${entityNamePlural} gelöscht`, `${count} ${entityNamePluralEnglish} deleted`));
        },
        onError: () =>
          feedback.failure(t(`Fehler beim Löschen der ${entityNamePlural}`, `Could not delete ${entityNamePluralEnglish}`)),
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
