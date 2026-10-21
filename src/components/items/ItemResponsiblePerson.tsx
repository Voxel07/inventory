import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Stack, TextField, Typography } from '@mui/material';
import { useMutationFeedback } from '../../hooks/useMutationFeedback';
import { orderPickupApi, type ItemResponsibility } from '../../services/orderPickupService';
import type { AccessPerson } from '../../types/inventoryAccess';
import { Button } from '../shared/ActionButtons';
import { useT } from '../../utils/naming';

export function ItemResponsiblePerson({ itemId, canEdit }: { itemId: string; canEdit: boolean }) {
  const t = useT(); const client = useQueryClient(); const feedback = useMutationFeedback();
  const key = ['item-responsibility', itemId];
  const query = useQuery({ queryKey: key, queryFn: () => orderPickupApi.responsibility(itemId) });
  const people = useQuery({ queryKey: ['item-responsibility-people', itemId], queryFn: () => orderPickupApi.responsibilityPeople(itemId), enabled: canEdit });
  const [draft, setDraft] = useState<ItemResponsibility | null>(null);
  const current = draft ?? query.data;
  const value: AccessPerson | string | null = current?.responsiblePersonId
    ? { id: current.responsiblePersonId, name: current.responsiblePersonName ?? '' }
    : current?.responsiblePersonName ?? null;
  const save = useMutation({ mutationFn: (data: ItemResponsibility) => orderPickupApi.setResponsibility(itemId,
    data.responsiblePersonId || null, data.responsiblePersonId ? null : data.responsiblePersonName?.trim() || null),
    onSuccess: (data) => { client.setQueryData(key, data); setDraft(null); void client.invalidateQueries({ queryKey: ['order-pickup-groups'] }); feedback.success(t('items.itemResponsiblePerson.responsiblePersonSaved')); }, onError: feedback.error });
  if (query.isError) return <Alert severity="error">{t('items.itemResponsiblePerson.couldNotLoadResponsiblePerson')}</Alert>;
  return <Stack spacing={1}>
    <Typography variant="subtitle2">{t('items.itemResponsiblePerson.responsibleForOrders')}</Typography>
    {canEdit ? <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Autocomplete<AccessPerson, false, false, true> freeSolo fullWidth size="small" options={people.data ?? []} value={value}
          disabled={query.isLoading || people.isLoading || save.isPending}
          getOptionLabel={person => typeof person === 'string' ? person : person.name}
          isOptionEqualToValue={(a, b) => typeof b !== 'string' && a.id === b.id}
          onChange={(_, person) => setDraft(typeof person === 'string' ? { responsiblePersonName: person }
            : person ? { responsiblePersonId: person.id, responsiblePersonName: person.name } : {})}
          onInputChange={(_, name, reason) => { if (reason === 'input') setDraft({ responsiblePersonName: name }); }}
          renderInput={params => <TextField {...params} label={t('common.responsiblePerson')}
            helperText={t('items.itemResponsiblePerson.choosePersonOrEnterName')}
            slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, maxLength: 255 } }} />} />
        <Button disabled={draft === null || save.isPending} sx={{ flexShrink: 0, alignSelf: 'flex-start' }}
          onClick={() => { if (draft !== null) save.mutate(draft); }}>{t('common.save')}</Button>
      </Stack>
      {people.error && <Alert severity="error">{people.error.message}</Alert>}
    </> : <Typography variant="body2">{query.data?.responsiblePersonName || t('common.unassigned')}</Typography>}
  </Stack>;
}
