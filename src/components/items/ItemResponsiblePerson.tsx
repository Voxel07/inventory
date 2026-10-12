import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useAssignableUsers } from '../../hooks/useUsers';
import { useMutationFeedback } from '../../hooks/useMutationFeedback';
import { orderPickupApi } from '../../services/orderPickupService';
import { Button } from '../shared/ActionButtons';
import { useLocalizedText } from '../../utils/naming';

export function ItemResponsiblePerson({ itemId, canEdit }: { itemId: string; canEdit: boolean }) {
  const t = useLocalizedText(); const client = useQueryClient(); const feedback = useMutationFeedback();
  const key = ['item-responsibility', itemId];
  const query = useQuery({ queryKey: key, queryFn: () => orderPickupApi.responsibility(itemId) });
  const people = useAssignableUsers(canEdit);
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (id: string) => orderPickupApi.setResponsibility(itemId, id || null),
    onSuccess: (data) => { client.setQueryData(key, data); setDraft(null); void client.invalidateQueries({ queryKey: ['order-pickup-groups'] }); feedback.success(t('Verantwortliche Person gespeichert', 'Responsible person saved')); }, onError: feedback.error });
  if (query.isError) return <Alert severity="error">{t('Verantwortliche Person konnte nicht geladen werden.', 'Could not load responsible person.')}</Alert>;
  return <Stack spacing={1}>
    <Typography variant="subtitle2">{t('Verantwortlich für Bestellungen', 'Responsible for orders')}</Typography>
    {canEdit ? <Stack direction="row" spacing={1}>
      <TextField select fullWidth size="small" label={t('Verantwortliche Person', 'Responsible person')} disabled={query.isLoading || save.isPending} value={draft ?? query.data?.responsiblePersonId ?? ''} onChange={e => setDraft(e.target.value)}>
        <MenuItem value="">{t('Nicht zugewiesen', 'Unassigned')}</MenuItem>
        {query.data?.responsiblePersonId && !people.data?.some(p => p.id === query.data?.responsiblePersonId) && <MenuItem value={query.data.responsiblePersonId}>{query.data.responsiblePersonName}</MenuItem>}
        {(people.data ?? []).map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.email}</MenuItem>)}
      </TextField>
      <Button disabled={draft === null || save.isPending} onClick={() => { if (draft !== null) save.mutate(draft); }}>{t('Speichern', 'Save')}</Button>
    </Stack> : <Typography variant="body2">{query.data?.responsiblePersonName || t('Nicht zugewiesen', 'Unassigned')}</Typography>}
  </Stack>;
}
