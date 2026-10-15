import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Stack, Typography } from '@mui/material';
import { PagedAutocomplete } from '../shared/PagedAutocomplete';
import { personOptions } from '../../services/assignmentOptions';
import { useMutationFeedback } from '../../hooks/useMutationFeedback';
import { orderPickupApi } from '../../services/orderPickupService';
import { Button } from '../shared/ActionButtons';
import { useT } from '../../utils/naming';

export function ItemResponsiblePerson({ itemId, canEdit }: { itemId: string; canEdit: boolean }) {
  const t = useT(); const client = useQueryClient(); const feedback = useMutationFeedback();
  const key = ['item-responsibility', itemId];
  const query = useQuery({ queryKey: key, queryFn: () => orderPickupApi.responsibility(itemId) });
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (id: string) => orderPickupApi.setResponsibility(itemId, id || null),
    onSuccess: (data) => { client.setQueryData(key, data); setDraft(null); void client.invalidateQueries({ queryKey: ['order-pickup-groups'] }); feedback.success(t('items.itemResponsiblePerson.responsiblePersonSaved')); }, onError: feedback.error });
  if (query.isError) return <Alert severity="error">{t('items.itemResponsiblePerson.couldNotLoadResponsiblePerson')}</Alert>;
  return <Stack spacing={1}>
    <Typography variant="subtitle2">{t('items.itemResponsiblePerson.responsibleForOrders')}</Typography>
    {canEdit ? <Stack direction="row" spacing={1}>
      <PagedAutocomplete size="small" label={t('common.responsiblePerson')} disabled={query.isLoading || save.isPending}
        value={draft ?? query.data?.responsiblePersonId ?? ''} selectedLabel={query.data?.responsiblePersonName}
        queryKey={['users', 'assignable']} getPage={personOptions} onChange={setDraft} />
      <Button disabled={draft === null || save.isPending} onClick={() => { if (draft !== null) save.mutate(draft); }}>{t('common.save')}</Button>
    </Stack> : <Typography variant="body2">{query.data?.responsiblePersonName || t('common.unassigned')}</Typography>}
  </Stack>;
}
