import { useAuth } from '../../hooks/useAuth';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Box, Checkbox, Chip, FormControlLabel, List, ListItem, ListItemText, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { getAccessGroups, getAccessPeople, saveInventoryAccess } from '../../services/inventoryAccessService';
import type { InventoryAccess, InventoryGrant } from '../../types/inventoryAccess';
import { useT } from '../../utils/naming';
import { canManageUsers } from '../../utils/access';

function SharingEditor({ kind, id, access, onClose }: { kind: string; id: string; access: InventoryAccess; onClose: () => void }) {
  const t = useT();
  const client = useQueryClient();
  const { user } = useAuth();
  const [ownerId, setOwnerId] = useState(access.ownerId);
  const people = useQuery({ queryKey: ['access-people'], queryFn: getAccessPeople });
  const groups = useQuery({ queryKey: ['access-groups'], queryFn: getAccessGroups });
  const [grants, setGrants] = useState<InventoryGrant[]>(access.grants);
  const [publicUse, setPublicUse] = useState(Boolean(access.publicUse));
  const save = useMutation({
    mutationFn: () => saveInventoryAccess(kind, id, { revision: access.revision, grants, ownerId, ...(kind === 'items' ? { publicUse } : {}) }),
    onSuccess: async () => { await client.invalidateQueries(); onClose(); },
  });
  const principals = [
    ...(people.data ?? []).filter(p => p.id !== access.ownerId).map(p => ({ key: `user:${p.id}`, label: p.name, userId: p.id, groupId: undefined as string | undefined })),
    ...(groups.data ?? []).map(g => ({ key: `group:${g.id}`, label: `${t('enum.value.group')}: ${g.name}`, groupId: g.id, userId: undefined as string | undefined })),
  ];
  const key = (g: InventoryGrant) => g.userId ? `user:${g.userId}` : `group:${g.groupId}`;
  const selected = principals.filter(p => grants.some(g => key(g) === p.key));
  return <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t('items.inventorySharing.manageSharing')}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Alert severity="info">{kind === 'storage-locations'
        ? t('items.inventorySharing.theOwnerAndInventoryAdminsAlwaysHaveAccessSharesOf')
        : t('items.inventorySharing.theOwnerAndInventoryAdminsAlwaysHaveAccessNewShares')}</Alert>
      {kind === 'items' && <FormControlLabel label={t('items.inventorySharing.publicAvailabilityHelp')}
        control={<Switch checked={publicUse} disabled={save.isPending} onChange={(_, checked) => setPublicUse(checked)} />} />}
      {(people.error || groups.error) && <Alert severity="error">{(people.error ?? groups.error)?.message}</Alert>}
      <Autocomplete multiple options={principals} value={selected} getOptionLabel={p => p.label}
        isOptionEqualToValue={(a, b) => a.key === b.key} disabled={save.isPending || people.isLoading || groups.isLoading}
        onChange={(_, values) => setGrants(values.map(p => ({ userId: p.userId, groupId: p.groupId, canEdit: grants.find(g => key(g) === p.key)?.canEdit ?? false })))}
        renderInput={params => <TextField {...params} label={t('items.inventorySharing.peopleAndGroups')} />} />
      {selected.map(p => <FormControlLabel key={p.key} label={`${p.label} — ${t('items.inventorySharing.allowEditing')}`}
        control={<Checkbox checked={grants.find(g => key(g) === p.key)?.canEdit ?? false} disabled={save.isPending}
          onChange={(_, checked) => setGrants(grants.map(g => key(g) === p.key ? { ...g, canEdit: checked } : g))} />} />)}
      {canManageUsers(user) && <Autocomplete options={people.data ?? []} getOptionLabel={p => p.name}
        isOptionEqualToValue={(a, b) => a.id === b.id} value={people.data?.find(p => p.id === ownerId) ?? null}
        disabled={save.isPending} onChange={(_, value) => setOwnerId(value?.id ?? access.ownerId)}
        renderInput={params => <TextField {...params} label={t('items.inventorySharing.transferOwnerNoOutstandingOperations')} />} />}
      <Typography variant="body2">{t('items.inventorySharing.removedSharesAreRevokedOnSaveAccessThroughOtherGroups')}</Typography>
      {save.error && <Alert severity="error">{save.error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button title={t('common.close')} disabled={save.isPending} onClick={onClose}>{t('common.cancel')}</Button>
      <Button title={t('items.inventorySharing.saveSharing')} variant="contained" disabled={save.isPending || !people.data || !groups.data} onClick={() => save.mutate()}>{t('common.save')}</Button></DialogActions>
  </Dialog>;
}

export function InventorySharing({ kind, id, access }: { kind: 'items' | 'storage-locations' | 'assemblies'; id: string; access?: InventoryAccess }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!access?.privateResource) return null;
  const audience = new Map<string, InventoryAccess['audience'][number]>();
  for (const person of access.audience) {
    const key = `${person.kind === 'group' ? 'group' : 'person'}:${person.principalId}`;
    const previous = audience.get(key);
    audience.set(key, previous ? { ...previous, canEdit: previous.canEdit || person.canEdit } : person);
  }
  return <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Stack spacing={1}>
    <Typography variant="subtitle2">{t('items.inventorySharing.accessSharing')}</Typography>
    <Box><Chip label={access.publicUse ? t('items.inventorySharing.publiclyAvailable') : t('items.inventorySharing.private')} color={access.publicUse ? 'success' : 'info'} size="small" /></Box>
    <List dense disablePadding>
      {[...audience.values()].map(person => <ListItem key={`${person.kind}:${person.principalId}`} disableGutters
        secondaryAction={<Chip size="small" variant="outlined" label={person.canEdit ? t('common.edit') : t('items.inventorySharing.view')} />}>
        <ListItemText sx={{ pr: 9, overflowWrap: 'anywhere' }} primary={person.name}
          secondary={person.kind === 'owner' ? t('items.inventorySharing.owner') : person.kind === 'group' ? t('enum.value.group') : t('enum.value.person')} />
      </ListItem>)}
      <ListItem disableGutters><ListItemText primary={t('items.inventorySharing.inventoryAdmins')} secondary={t('common.edit')} /></ListItem>
      {access.publicUse && <ListItem disableGutters><ListItemText primary={t('items.inventorySharing.organizationMembers')} secondary={t('items.inventorySharing.publicOrderingAccess')} /></ListItem>}
    </List>
    {access.canManage && <Button title={t('items.inventorySharing.manageSharing')} onClick={() => setOpen(true)}>{t('items.inventorySharing.manageSharing')} ({access.grants.length})</Button>}
  </Stack>{open && <SharingEditor key={`${id}:${access.revision}`} kind={kind} id={id} access={access} onClose={() => setOpen(false)} />}</Paper>;
}
