import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Checkbox, Chip, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { Button, MenuItem } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { ListPagination } from '../shared/ListPagination';
import { deleteAccessGroup, getAccessGroups, getAccessPeople, saveAccessGroup } from '../../services/inventoryAccessService';
import type { AccessGroup } from '../../types/inventoryAccess';
import { useAuth } from '../../hooks/useAuth';
import { useClientPagination } from '../../hooks/useClientPagination';
import { canCreateInventory, canManageUsers } from '../../utils/access';
import { useT } from '../../utils/naming';

function GroupEditor({ group, onDone }: { group?: AccessGroup; onDone: () => void }) {
  const t = useT(); const client = useQueryClient();
  const { user } = useAuth();
  const people = useQuery({ queryKey: ['access-people'], queryFn: getAccessPeople });
  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState(group?.memberIds ?? []);
  const [reason, setReason] = useState('');
  const [adminManaged, setAdminManaged] = useState(false);
  const save = useMutation({ mutationFn: () => saveAccessGroup(group?.id, { name, memberIds: members, revision: group?.revision ?? 0, reason, ...(group ? {} : { adminManaged }) }),
    onSuccess: async () => { await client.invalidateQueries(); onDone(); } });
  const remove = useMutation({ mutationFn: () => deleteAccessGroup(group!.id, { revision: group!.revision, reason }),
    onSuccess: async () => { await client.invalidateQueries(); onDone(); } });
  const pending = save.isPending || remove.isPending;
  const error = save.error ?? remove.error ?? people.error;
  return <Dialog open onClose={pending ? undefined : onDone} fullWidth maxWidth="sm">
    <DialogTitle>{group ? t('operations.inventoryAccessGroups.editGroup') : t('operations.inventoryAccessGroups.createGroup')}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
    <TextField required label={t('operations.inventoryAccessGroups.groupName')} value={name} disabled={pending} onChange={e => setName(e.target.value)} />
    <Autocomplete multiple options={people.data ?? []} getOptionLabel={p => p.name} isOptionEqualToValue={(a, b) => a.id === b.id} disabled={pending}
      value={(people.data ?? []).filter(p => members.includes(p.id))} onChange={(_, values) => setMembers(values.map(p => p.id))}
      renderInput={params => <TextField {...params} label={t('operations.inventoryAccessGroups.members')} />} />
    {!group && canManageUsers(user) && <FormControlLabel label={t('operations.inventoryAccessGroups.adminGroupVisibleToEveryoneForSharingManagedByInventory')}
      control={<Checkbox checked={adminManaged} disabled={pending} onChange={(_, checked) => setAdminManaged(checked)} />} />}
    <TextField required label={t('common.reason')} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} />
    {error && <Alert severity="error">{error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
      {group && <Button title={t('operations.inventoryAccessGroups.deleteTheGroupAndAllOfItsShares')} color="error" disabled={pending || !reason.trim()} onClick={() => remove.mutate()}>{t('common.delete')}</Button>}
      <Button title={t('common.cancel')} disabled={pending} onClick={onDone}>{t('common.cancel')}</Button>
      {canCreateInventory(user) && <Button title={t('common.save')} variant="contained" disabled={pending || !name.trim() || !reason.trim() || !people.data} onClick={() => save.mutate()}>{t('common.save')}</Button>}
    </DialogActions>
  </Dialog>;
}

/** Owner and group type columns are dropped on phones; the owner moves under the group name. */
const wideOnly = { display: { xs: 'none', sm: 'table-cell' } } as const;

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
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const term = search.trim().toLocaleLowerCase();
  const filtered = (groups.data ?? []).filter(group =>
    (type === 'all' || (type === 'admin' ? !group.ownerId : Boolean(group.ownerId)))
    && (!term || [group.name, group.ownerName ?? t('operations.inventoryAccessGroups.inventoryAdmins'), ...group.members.map(member => member.name)]
      .some(value => value.toLocaleLowerCase().includes(term))));
  const pagination = useClientPagination(filtered);
  return <Paper variant="outlined" sx={{ p: 2, mt: 3 }}><Typography variant="h6">{t('operations.inventoryAccessGroups.groupsForPrivateSharing')}</Typography>
    <Typography variant="body2" color="text.secondary">{t('operations.inventoryAccessGroups.membersGainAccessToEveryRecordSharedWithThisGroup')}</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ my: 2 }}>
      <TextField size="small" label={t('operations.inventoryAccessGroups.searchGroups')} value={search} sx={{ flex: 1 }}
        onChange={event => { setSearch(event.target.value); pagination.setPage(1); }} />
      <TextField select size="small" label={t('operations.inventoryAccessGroups.groupType')} value={type} sx={{ minWidth: 200 }}
        onChange={event => { setType(event.target.value); pagination.setPage(1); }}>
        <MenuItem value="all">{t('operations.inventoryAccessGroups.allGroupTypes')}</MenuItem>
        <MenuItem value="admin">{t('operations.inventoryAccessGroups.adminManaged')}</MenuItem>
        <MenuItem value="personal">{t('operations.inventoryAccessGroups.personal')}</MenuItem>
      </TextField>
      {canCreateInventory(user) && <Button variant="contained" title={t('operations.inventoryAccessGroups.createGroup')} onClick={() => setEditing('new')}>{t('operations.inventoryAccessGroups.addGroup')}</Button>}
    </Stack>
    {groups.error && <Alert severity="error" sx={{ mb: 2 }}
      action={<Button onClick={() => { void groups.refetch(); }}>{t('common.retryLoadingTheData')}</Button>}>{groups.error.message}</Alert>}
    <TableContainer><Table size="small" aria-label={t('operations.inventoryAccessGroups.groupsForPrivateSharing')}>
      <TableHead><TableRow>
        <TableCell>{t('operations.inventoryAccessGroups.groupName')}</TableCell>
        <TableCell sx={wideOnly}>{t('operations.inventoryAccessGroups.owner')}</TableCell>
        <TableCell sx={wideOnly}>{t('operations.inventoryAccessGroups.groupType')}</TableCell>
        <TableCell>{t('operations.inventoryAccessGroups.members')}</TableCell>
        <TableCell>{t('common.actions')}</TableCell>
      </TableRow></TableHead>
      <TableBody>
        {groups.isPending && <TableRow><TableCell colSpan={5}>{t('operations.inventoryAccessGroups.loadingGroups')}</TableCell></TableRow>}
        {groups.isSuccess && !filtered.length && <TableRow><TableCell colSpan={5}>
          {groups.data.length ? t('operations.inventoryAccessGroups.noMatchingGroups') : t('operations.inventoryAccessGroups.noGroups')}
        </TableCell></TableRow>}
        {!groups.isError && pagination.pageItems.map(group => <TableRow key={group.id} hover>
          <TableCell component="th" scope="row" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
            {group.name}
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, fontWeight: 400 }}>{group.ownerName ?? t('operations.inventoryAccessGroups.inventoryAdmins')}</Typography>
          </TableCell>
          <TableCell sx={wideOnly}>{group.ownerName ?? t('operations.inventoryAccessGroups.inventoryAdmins')}</TableCell>
          <TableCell sx={{ ...wideOnly, whiteSpace: 'nowrap' }}><Chip size="small"
            label={group.ownerId ? t('operations.inventoryAccessGroups.personal') : t('operations.inventoryAccessGroups.adminManaged')}
            sx={{ bgcolor: group.ownerId ? '#1d4ed8' : '#c2410c', color: '#fff' }} /></TableCell>
          <TableCell>{group.canManage || group.memberIds.includes(user?.id ?? '') ? <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5 }}>
            {group.members.length ? group.members.map(member => <Chip key={member.id} size="small" variant="outlined" label={member.name} />) : '—'}
          </Stack>
            : <Tooltip title={t('operations.inventoryAccessGroups.membersVisibleToManagers')}><span aria-label={t('operations.inventoryAccessGroups.membersVisibleToManagers')}>—</span></Tooltip>}</TableCell>
          <TableCell>{group.canManage
            ? <Button size="small" title={t('operations.inventoryAccessGroups.editGroup')} onClick={() => setEditing(group)}>{t('common.edit')}</Button>
            : <Typography variant="body2" color="text.secondary">{t('operations.inventoryAccessGroups.viewOnly')}</Typography>}</TableCell>
        </TableRow>)}
      </TableBody>
    </Table></TableContainer>
    <ListPagination count={filtered.length} page={pagination.page} onChange={pagination.setPage}
      pageSize={pagination.pageSize} onPageSizeChange={pagination.onPageSizeChange} />
    {editing && <GroupEditor key={editing === 'new' ? 'new' : `${editing.id}:${editing.revision}`} group={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
  </Paper>;
}
