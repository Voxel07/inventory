import { useAuth } from '../../hooks/useAuth';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Box, Checkbox, Chip, FormControlLabel, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { getAccessGroups, getAccessPeople, saveInventoryAccess } from '../../services/inventoryAccessService';
import type { InventoryAccess, InventoryGrant } from '../../types/inventoryAccess';
import { useT } from '../../utils/naming';
import { canManageUsers } from '../../utils/access';

type Source = InventoryAccess['sources'][number];

function SharingEditor({ kind, id, access, onClose }: { kind: string; id: string; access: InventoryAccess; onClose: () => void }) {
  const t = useT();
  const client = useQueryClient();
  const { user } = useAuth();
  const [ownerId, setOwnerId] = useState(access.ownerId);
  const people = useQuery({ queryKey: ['access-people'], queryFn: getAccessPeople });
  const groups = useQuery({ queryKey: ['access-groups'], queryFn: getAccessGroups });
  const [grants, setGrants] = useState<InventoryGrant[]>(access.grants);
  const [reason, setReason] = useState('');
  const [publicUse, setPublicUse] = useState(Boolean(access.publicUse));
  const save = useMutation({
    mutationFn: () => saveInventoryAccess(kind, id, { revision: access.revision, grants, reason, ownerId, ...(kind === 'items' ? { publicUse } : {}) }),
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
      {kind === 'items' && <FormControlLabel label={t('items.inventorySharing.offerForUseOrganizationMembersSeeThisItemReadOnly')}
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
      <TextField required label={t('items.inventorySharing.reasonForChange')} value={reason} disabled={save.isPending} onChange={e => setReason(e.target.value)} />
      <Typography variant="body2">{t('items.inventorySharing.removedSharesAreRevokedOnSaveAccessThroughOtherGroups')}</Typography>
      {save.error && <Alert severity="error">{save.error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button title={t('common.close')} disabled={save.isPending} onClick={onClose}>{t('common.cancel')}</Button>
      <Button title={t('items.inventorySharing.saveSharing')} variant="contained" disabled={!reason.trim() || save.isPending || !people.data || !groups.data} onClick={() => save.mutate()}>{t('common.save')}</Button></DialogActions>
  </Dialog>;
}

export function InventorySharing({ kind, id, access }: { kind: 'items' | 'storage-locations' | 'assemblies'; id: string; access?: InventoryAccess }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!access?.privateResource) return null;
  const sourceLabel = (source: Source) => {
    switch (source.kind) {
      case 'group': return `${t('enum.value.group')}: ${source.name}`;
      case 'owner': return t('items.inventorySharing.owner');
      case 'admin': return t('profile.roles.admin');
      case 'location': return `${t('items.inventorySharing.viaLocation')}: ${source.name}`;
      case 'public_use': return t('items.inventorySharing.offeredForUse');
      default: return t('items.inventorySharing.directShare');
    }
  };
  const inherited = access.inherited ?? [];
  const owner = access.ownerName ?? '';
  return <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Stack spacing={1}>
    <Typography variant="subtitle2">{t('items.inventorySharing.accessSharing')}</Typography>
    <Box><Chip label={t('items.inventorySharing.private')} color="info" size="small" />{access.publicUse && <> <Chip label={t('items.inventorySharing.offeredForUse')} color="success" size="small" /></>} <Typography component="span">{t('items.inventorySharing.owner')}: {access.ownerName}</Typography></Box>
    <Typography variant="body2">{access.canManage
      ? t('items.inventorySharing.onlyYouInventoryAdminsSharedPeopleOrGroupsAndThe')
      : access.sources.some(source => source.kind === 'public_use')
      ? t('items.inventorySharing.ownerOffersThisItemForUseYouCanRequestIt', { owner: owner })
      : t('items.inventorySharing.thisPrivateRecordIsSharedWithYouYouCannotChange')}</Typography>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{access.sources.map(source => <Chip
      key={`${source.kind}:${source.principalId}`} size="small" variant="outlined"
      label={`${sourceLabel(source)} · ${source.canEdit ? t('common.edit') : t('items.inventorySharing.view')}`} />)}</Stack>
    {access.canManage && inherited.length > 0 && <Box>
      <Typography variant="caption" color="text.secondary">{t('items.inventorySharing.alsoThroughTheStorageLocation')}</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>{inherited.map(share => <Chip
        key={`${share.locationId}:${share.kind}:${share.principalId}`} size="small" variant="outlined"
        label={`${share.locationName} · ${share.kind === 'owner' ? `${t('items.inventorySharing.locationOwner')}: ${share.name}` : share.kind === 'group' ? `${t('enum.value.group')}: ${share.name}` : share.name} · ${share.canEdit ? t('common.edit') : t('items.inventorySharing.view')}`} />)}</Stack>
    </Box>}
    {access.canManage && <Button title={t('items.inventorySharing.manageSharing')} onClick={() => setOpen(true)}>{t('items.inventorySharing.manageSharing')} ({access.grants.length})</Button>}
  </Stack>{open && <SharingEditor key={`${id}:${access.revision}`} kind={kind} id={id} access={access} onClose={() => setOpen(false)} />}</Paper>;
}
