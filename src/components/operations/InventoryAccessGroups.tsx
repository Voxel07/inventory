import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Checkbox, Chip, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { deleteAccessGroup, getAccessGroups, getAccessPeople, saveAccessGroup } from '../../services/inventoryAccessService';
import type { AccessGroup } from '../../types/inventoryAccess';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';
import { useLocalizedText } from '../../utils/naming';

function GroupEditor({ group, onDone }: { group?: AccessGroup; onDone: () => void }) {
  const t = useLocalizedText(); const client = useQueryClient();
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
    <TextField required label={t('Gruppenname', 'Group name')} value={name} disabled={pending} onChange={e => setName(e.target.value)} />
    <Autocomplete multiple options={people.data ?? []} getOptionLabel={p => p.name} isOptionEqualToValue={(a, b) => a.id === b.id} disabled={pending}
      value={(people.data ?? []).filter(p => members.includes(p.id))} onChange={(_, values) => setMembers(values.map(p => p.id))}
      renderInput={params => <TextField {...params} label={t('Mitglieder', 'Members')} />} />
    {!group && canManageUsers(user) && <FormControlLabel label={t('Admin-Gruppe (für alle zum Teilen sichtbar, nur von Inventar-Admins verwaltet)', 'Admin group (visible to everyone for sharing, managed by inventory admins only)')}
      control={<Checkbox checked={adminManaged} disabled={pending} onChange={(_, checked) => setHqManaged(checked)} />} />}
    <TextField required label={t('Grund', 'Reason')} value={reason} disabled={pending} onChange={e => setReason(e.target.value)} />
    {error && <Alert severity="error">{error.message}</Alert>}
    <Stack direction="row" spacing={1}><Button title={t('Speichern', 'Save')} disabled={pending || !name.trim() || !reason.trim() || !people.data} onClick={() => save.mutate()}>{t('Speichern', 'Save')}</Button>
      {group && <Button title={t('Gruppe und alle ihre Freigaben löschen', 'Delete the group and all of its shares')} color="error" disabled={pending || !reason.trim()} onClick={() => remove.mutate()}>{t('Löschen', 'Delete')}</Button>}
      <Button title={t('Abbrechen', 'Cancel')} disabled={pending} onClick={onDone}>{t('Abbrechen', 'Cancel')}</Button></Stack>
  </Stack>;
}

/**
 * Share groups: everyone (e.g. a tenant for the people allowed into their building) manages their
 * own groups; inventory admins see and manage all groups and create admin groups.
 */
export function InventoryAccessGroups() {
  const t = useLocalizedText();
  const groups = useQuery({ queryKey: ['access-groups'], queryFn: getAccessGroups });
  const [editing, setEditing] = useState<AccessGroup | 'new' | null>(null);
  return <Paper variant="outlined" sx={{ p: 2, mt: 3 }}><Typography variant="h6">{t('Gruppen für private Freigaben', 'Groups for private sharing')}</Typography>
    <Typography variant="body2">{t('Mitglieder erhalten Zugriff auf alle Einträge, die mit dieser Gruppe geteilt wurden, auch auf alles, was in einem freigegebenen Lagerort liegt. Eigentümer der Gruppe und Inventar-Admins ändern die Mitgliedschaft.', 'Members gain access to every record shared with this group, including everything stored in a shared location. The group owner and inventory admins change membership.')}</Typography>
    {groups.error && <Alert severity="error">{groups.error.message}</Alert>}
    <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      {(groups.data ?? []).map(g => g.canManage
        ? <Button key={g.id} title={t('Gruppe bearbeiten', 'Edit group')} onClick={() => setEditing(g)}>{g.name} ({g.memberIds.length}){g.ownerName ? '' : ' · Admin'}</Button>
        : <Chip key={g.id} size="small" variant="outlined" label={`${g.name} · ${g.ownerName ?? 'Admin'}`} />)}
      <Button title={t('Gruppe erstellen', 'Create group')} onClick={() => setEditing('new')}>{t('Gruppe hinzufügen', 'Add group')}</Button>
    </Stack>{editing && <GroupEditor key={editing === 'new' ? 'new' : `${editing.id}:${editing.revision}`} group={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
  </Paper>;
}
