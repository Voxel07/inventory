import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { apiRequest } from '../../services/apiClient';
import { authorizedFetch, responseError } from '../../services/apiTransport';
import { assertAuthSession, captureAuthSession } from '../../services/authManager';
import { API_URL } from '../../config/runtimeConfig';
import { getAccessPeople } from '../../services/inventoryAccessService';
import { useT } from '../../utils/naming';
import type { User } from '../../types';

type Overview = { active: boolean; revision: number; keeperAssignments: number; custody: unknown[];
  resources: { policyId: string; id: string; kind: string; name: string }[]; moreResources: boolean };
export function AccountLifecyclePanel({ user }: { user: User }) {
  const t = useT(); const client = useQueryClient();
  const [reason, setReason] = useState(''); const [successor, setSuccessor] = useState(''); const [selected, setSelected] = useState<string[]>([]);
  const overview = useQuery({ queryKey: ['account-lifecycle', user.id], queryFn: () => apiRequest<Overview>(`/api/users/${user.id}/lifecycle`) });
  const people = useQuery({ queryKey: ['access-people'], queryFn: getAccessPeople });
  const operation = useMutation({ mutationFn: async (action: 'status' | 'transfer' | 'export' | 'erase') => {
    if (action === 'export') {
      const context = captureAuthSession();
      const response = await authorizedFetch(`${API_URL}/api/users/${user.id}/personal-data/export`, { signal: AbortSignal.timeout(60000) }, context);
      if (!response.ok) throw await responseError(response);
      const blob = await response.blob(); assertAuthSession(context);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `inventory-person-${user.id}.zip`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    if (!overview.data) return;
    if (action === 'status') await apiRequest(`/api/users/${user.id}/lifecycle`, { method: 'PATCH', body: { active: !overview.data.active, revision: overview.data.revision, reason } });
    if (action === 'transfer') {
      const result = await apiRequest<{ blocked: Record<string, string> }>(`/api/users/${user.id}/lifecycle/transfer`, { method: 'POST', body: { successorId: successor, policyIds: selected, reason } });
      if (Object.keys(result.blocked).length) throw new Error(Object.values(result.blocked).join('; '));
      setSelected([]);
    }
    if (action === 'erase') await apiRequest(`/api/users/${user.id}/personal-data/pseudonymize`, { method: 'POST', body: { revision: overview.data.revision, reason } });
  }, onSettled: async () => { await client.invalidateQueries({ queryKey: ['account-lifecycle', user.id] }); await client.invalidateQueries({ queryKey: ['users'] }); } });
  const state = overview.data;
  return <Stack spacing={1.5}>
    <Typography variant="h6">{t('review.lifecycle')}</Typography>
    {overview.error && <Alert severity="error">{overview.error.message}</Alert>}
    {state && <>
      <Typography>{t(state.active ? 'review.active' : 'review.inactive')} · {t('review.obligations')}: {state.custody.length} / {state.keeperAssignments}</Typography>
      <TextField label={t('review.reason')} value={reason} onChange={e => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
        <Button disabled={!reason.trim() || operation.isPending} onClick={() => operation.mutate('status')}>{t(state.active ? 'review.deactivate' : 'review.reactivate')}</Button>
        <Button disabled={operation.isPending} onClick={() => operation.mutate('export')}>{t('review.export')}</Button>
        <Button color="error" disabled={!reason.trim() || state.custody.length > 0 || state.keeperAssignments > 0 || state.resources.length > 0 || operation.isPending} onClick={() => operation.mutate('erase')}>{t('review.pseudonymize')}</Button>
      </Stack>
      {state.resources.map(resource => <FormControlLabel key={resource.policyId} label={resource.name} control={<Checkbox checked={selected.includes(resource.policyId)} onChange={(_, checked) => setSelected(ids => checked ? [...ids, resource.policyId] : ids.filter(id => id !== resource.policyId))} />} />)}
      {state.moreResources && <Typography variant="caption">{t('review.moreOwnership')}</Typography>}
      {state.resources.length > 0 && <>
        <Autocomplete options={(people.data ?? []).filter(p => p.id !== user.id)} getOptionLabel={p => p.name} value={people.data?.find(p => p.id === successor) ?? null} onChange={(_, value) => setSuccessor(value?.id ?? '')} renderInput={params => <TextField {...params} label={t('review.successor')} />} />
        <Button disabled={!successor || !selected.length || !reason.trim() || operation.isPending} onClick={() => operation.mutate('transfer')}>{t('review.transfer')}</Button>
      </>}
    </>}
    {operation.error && <Alert severity="error">{operation.error.message}</Alert>}
  </Stack>;
}
