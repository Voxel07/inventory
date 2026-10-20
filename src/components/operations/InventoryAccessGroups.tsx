import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Checkbox, Chip, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { deleteAccessGroup, getAccessGroups, getAccessPeople, saveAccessGroup } from '../../services/inventoryAccessService';
import type { AccessGroup } from '../../types/inventoryAccess';
import { useAuth } from '../../hooks/useAuth';
import { canCreateInventory, canManageUsers } from '../../utils/access';
import { useT } from '../../utils/naming';

function GroupEditor({ group, onDone }: { group?: AccessGroup; onDone: () => void }) {
  const t = useT(); const client = useQueryClient();
  const { user } = useAuth();
  const people = useQuery({ queryKey: ['access-people'], queryFn: getAccessPeople });
  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState(group?.memberIds ?? []);
  const [reason, setReason] = useState('');
  const [adminManaged, setHqManaged] = useState(false);
  const save = useMutation({ mutationFn: () => saveAccessGroup(group?.id, { name, memberIds: members, revision: group?.revision ?? 0, reason, ...(group ? {} : { adminManaged }) }),
    onSuccess: async () => { await client.invalidateQueries(); onDone(); } });
  const remove = useMutation({ mutationFn: () => deleteAccessGroup(group!.id, { revision: group!.revision, reason }),
    onSuccess: async () => { await client.invalidateQueries(); onDone(); } });
  const pending = save.isPending || remove.isPending;
  const error = save.error ?? remove.error ?? people.error;
  return <Stack spacing={2} sx={{ my: 2 }}>
    <TextField required label={t('operations.inventoryAccessGroups.groupName')} value={name} disabled={pending} onChange={e => setName(e.target.value)} />
    <Autocomplete multiple options={people.data ?? []} getOptionLabel={p => p.name} isOptionEqualToValue={(a, b) => a.id === b.id} disabled={pending}
      value={(people.data ?? []).filter(p => members.includes(p.id))} onChange={(_, values) => setMembers(values.map(p => p.id))}
      renderInput={params => <TextField {...params} label={t('operations.inventoryAccessGroups.members')} />} />
    {!group && canManageUsers(user) && <FormControlLabel label={t('operations.inventoryAccessGroups.adminGroupVisibleToEveryoneForSharingManagedByInventory')}
      control={<Checkbox checked={adminManaged} disabled={pending} onChange={(_, checked) => setHqManaged(checked)} />} />}
    <TextField required label={t('common.reason')} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} />
    {error && <Alert severity="error">{error.message}</Alert>}
    <Stack direction="row" spacing={1}>{canCreateInventory(user) && <Button title={t('common.save')} disabled={pending || !name.trim() || !reason.trim() || !people.data} onClick={() => save.mutate()}>{t('common.save')}</Button>}
      {group && <Button title={t('operations.inventoryAccessGroups.deleteTheGroupAndAllOfItsShares')} color="error" disabled={pending || !reason.trim()} onClick={() => remove.mutate()}>{t('common.delete')}</Button>}
      <Button title={t('common.cancel')} disabled={pending} onClick={onDone}>{t('common.cancel')}</Button></Stack>
  </Stack>;
}

/**
 * Share groups: everyone who owns private inventory (e.g. a tenant for the people allowed into their
 * building) manages their own groups; read-only accounts only see the groups they belong to.
 * Inventory admins see and manage all groups and create admin groups.
 */
export function InventoryAccessGroups() {
  const t = useT();
  const { user } = useAuth();
  const groups = useQuery({ queryKey: ['access-groups'], queryFn: getAccessGroups });
  const [editing, setEditing] = useState<AccessGroup | 'new' | null>(null);
  return <Paper variant="outlined" sx={{ p: 2, mt: 3 }}><Typography variant="h6">{t('operations.inventoryAccessGroups.groupsForPrivateSharing')}</Typography>
    <Typography variant="body2">{t('operations.inventoryAccessGroups.membersGainAccessToEveryRecordSharedWithThisGroup')}</Typography>
    {groups.error && <Alert severity="error">{groups.error.message}</Alert>}
    <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      {(groups.data ?? []).map(g => g.canManage
        ? <Button key={g.id} title={t('operations.inventoryAccessGroups.editGroup')} onClick={() => setEditing(g)}>{g.name} ({g.memberIds.length}){g.ownerName ? '' : ' · Admin'}</Button>
        : <Chip key={g.id} size="small" variant="outlined" label={`${g.name} · ${g.ownerName ?? 'Admin'}`} />)}
      {canCreateInventory(user) && <Button title={t('operations.inventoryAccessGroups.createGroup')} onClick={() => setEditing('new')}>{t('operations.inventoryAccessGroups.addGroup')}</Button>}
    </Stack>{editing && <GroupEditor key={editing === 'new' ? 'new' : `${editing.id}:${editing.revision}`} group={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
  </Paper>;
}
