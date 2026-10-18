import { locationLabel } from '../../utils/locationHierarchy';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { PagedAutocomplete } from '../shared/PagedAutocomplete';
import { personOptions } from '../../services/assignmentOptions';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useMutationFeedback } from '../../hooks/useMutationFeedback';
import { orderPickupApi, type OrderKind, type PickupAssignment } from '../../services/orderPickupService';
import { useT } from '../../utils/naming';

export function OrderPickupGroups({ kind, orderId }: { kind: OrderKind; orderId: string }) {
  const t = useT(); const feedback = useMutationFeedback(); const client = useQueryClient();
  const key = ['order-pickup-groups', kind, orderId];
  const query = useQuery({ queryKey: key, queryFn: () => orderPickupApi.get(kind, orderId), refetchInterval: 60_000 });
  const [draft, setDraft] = useState<Record<string, PickupAssignment> | null>(null);
  const { data: locations = [] } = useStorageLocations();
  const save = useMutation({ mutationFn: (assignments: Record<string, PickupAssignment>) => orderPickupApi.save(kind, orderId, assignments),
    onSuccess: (plan) => { client.setQueryData(key, plan); setDraft(null); feedback.success(t('orders.orderPickupGroups.pickupGroupsSaved')); }, onError: feedback.error });
  const notify = useMutation({ mutationFn: () => orderPickupApi.notify(kind, orderId),
    onSuccess: (count) => { feedback.success(t('orders.orderPickupGroups.notifiedCountResponsiblePeople', { count: count })); void client.invalidateQueries({ queryKey: ['notifications'] }); }, onError: feedback.error });
  const groups = query.data?.groups ?? [];
  const lines = groups.flatMap(g => g.items);
  const update = (id: string, value: Partial<PickupAssignment>) => setDraft(current => current && ({ ...current, [id]: { ...current[id], ...value } }));
  function edit() {
    setDraft(Object.fromEntries(groups.flatMap(g => g.items.map(item => [item.itemId, { responsiblePersonId: g.responsiblePersonId ?? null, groupName: g.name, pickupLocationId: g.pickupLocationId ?? null }]))));
  }
  return <Box sx={{ mb: 2 }}>
    <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="h6">{t('orders.orderPickupGroups.responsiblePeoplePickupGroups')}</Typography>
        {query.data && <Typography variant="body2" color="text.secondary">{query.data.orderName}</Typography>}
      </Box>
      {query.data?.canEdit && <>
        <Button title={t('orders.orderPickupGroups.setResponsiblePeopleItemGroupsAndPickupPoints')} onClick={edit}>{t('orders.orderPickupGroups.editGroups')}</Button>
        <Button title={t('orders.orderPickupGroups.notifyResponsiblePeopleAboutTheirOrderedItems')} disabled={notify.isPending || !groups.some(g => g.responsiblePersonId)} onClick={() => notify.mutate()}>{t('orders.orderPickupGroups.notifyResponsiblePeople')}</Button>
      </>}
    </Stack>
    {query.isLoading && <LinearProgress />}
    {query.isError && <Alert severity="error" action={<Button onClick={() => { void query.refetch(); }}>{t('common.retry')}</Button>}>{t('orders.orderPickupGroups.couldNotLoadPickupGroups')}</Alert>}
    <Stack spacing={1}>
      {groups.map((group, index) => <Box key={group.key}>
        {(index === 0 || group.responsiblePersonId !== groups[index - 1].responsiblePersonId) && <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1, mb: 0.5 }}>{group.responsiblePersonName || t('orders.orderPickupGroups.unassigned')}</Typography>}
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ p: 1, bgcolor: 'action.hover', gap: 1, justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere', minWidth: 0 }}>{group.name}</Typography>
            <Typography variant="body2">{t('orders.orderPickupGroups.pickupPoint')}: {group.pickupLocationName || t('orders.orderPickupGroups.notSet')}</Typography>
          </Stack>
          {group.items.map(item => <Stack key={item.itemId} direction="row" spacing={1} sx={{ p: 1, alignItems: 'center', borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" sx={{ flex: 1, overflowWrap: 'anywhere' }}>{item.name}</Typography>
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>{t('enum.value.ordered')} <strong>{item.ordered}</strong> · {t('common.prepared')} <strong>{item.prepared}</strong></Typography>
          </Stack>)}
        </Paper>
      </Box>)}
    </Stack>
    <Dialog open={draft !== null} onClose={() => { if (!save.isPending) setDraft(null); }} fullWidth maxWidth="md">
      <DialogTitle>{t('orders.orderPickupGroups.itemGroupsPickupPoints')}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('orders.orderPickupGroups.itemsWithTheSameResponsiblePersonGroupNameAndPickup')}</Typography>
        <Button component={RouterLink} to="/storage-locations" sx={{ mb: 2 }}>{t('orders.orderPickupGroups.managePickupPointsInStorageLocations')}</Button>
        <Stack spacing={2}>{draft && lines.map(item => <Paper key={item.itemId} variant="outlined" sx={{ p: 1.5 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>{item.name}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <PagedAutocomplete size="small" label={t('common.responsiblePerson')}
              value={draft[item.itemId]?.responsiblePersonId}
              selectedLabel={groups.find(g => g.items.some(i => i.itemId === item.itemId))?.responsiblePersonName}
              queryKey={['users', 'assignable']} getPage={personOptions}
              onChange={value => update(item.itemId, { responsiblePersonId: value || null })} />
            <TextField fullWidth size="small" label={t('orders.orderPickupGroups.itemGroup')} value={draft[item.itemId]?.groupName ?? ''} slotProps={{ htmlInput: { maxLength: 160 } }} onChange={e => update(item.itemId, { groupName: e.target.value })} />
            <TextField select fullWidth size="small" label={t('orders.orderPickupGroups.pickupPoint')} value={draft[item.itemId]?.pickupLocationId ?? ''} onChange={e => update(item.itemId, { pickupLocationId: e.target.value || null })}>
              <MenuItem value="">{t('orders.orderPickupGroups.notSet')}</MenuItem>
              {locations.filter(l => l.active).map(l => <MenuItem key={l.id} value={l.id}>{locationLabel(l)}</MenuItem>)}
            </TextField>
          </Stack>
        </Paper>)}</Stack>
      </DialogContent>
      <DialogActions><Button disabled={save.isPending} onClick={() => setDraft(null)}>{t('common.cancel')}</Button><Button variant="contained" disabled={save.isPending || !draft || Object.values(draft).some(a => !a.groupName.trim())} onClick={() => { if (draft) save.mutate(draft); }}>{t('common.save')}</Button></DialogActions>
    </Dialog>
  </Box>;
}
