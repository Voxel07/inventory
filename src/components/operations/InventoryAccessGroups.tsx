import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Paper, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { getAccessGroups, getAccessPeople, saveAccessGroup } from '../../services/inventoryAccessService';
import type { AccessGroup } from '../../types/inventoryAccess';
import { useLocalizedText } from '../../utils/naming';

function GroupEditor({ group, onDone }: { group?: AccessGroup; onDone: () => void }) {
  const t = useLocalizedText(); const client = useQueryClient();
  const people = useQuery({ queryKey: ['access-people'], queryFn: getAccessPeople });
  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState(group?.memberIds ?? []);
  const [reason, setReason] = useState('');
  const save = useMutation({ mutationFn: () => saveAccessGroup(group?.id, { name, memberIds: members, revision: group?.revision ?? 0, reason }),
    onSuccess: async () => { await client.invalidateQueries(); onDone(); } });
  return <Stack spacing={2} sx={{ my: 2 }}>
    <TextField required label={t('Gruppenname', 'Group name')} value={name} onChange={e => setName(e.target.value)} />
    <Autocomplete multiple options={people.data ?? []} getOptionLabel={p => p.name} isOptionEqualToValue={(a, b) => a.id === b.id}
      value={(people.data ?? []).filter(p => members.includes(p.id))} onChange={(_, values) => setMembers(values.map(p => p.id))}
      renderInput={params => <TextField {...params} label={t('Mitglieder', 'Members')} />} />
    <TextField required label={t('Grund', 'Reason')} value={reason} onChange={e => setReason(e.target.value)} />
    {(save.error || people.error) && <Alert severity="error">{(save.error ?? people.error)?.message}</Alert>}
    <Stack direction="row" spacing={1}><Button title={t('Speichern', 'Save')} disabled={save.isPending || !name.trim() || !reason.trim() || !people.data} onClick={() => save.mutate()}>{t('Speichern', 'Save')}</Button>
      <Button title={t('Abbrechen', 'Cancel')} disabled={save.isPending} onClick={onDone}>{t('Abbrechen', 'Cancel')}</Button></Stack>
  </Stack>;
}
export function InventoryAccessGroups() {
  const t = useLocalizedText();
  const groups = useQuery({ queryKey: ['access-groups'], queryFn: getAccessGroups });
  const [editing, setEditing] = useState<AccessGroup | 'new' | null>(null);
  return <Paper variant="outlined" sx={{ p: 2, mt: 3 }}><Typography variant="h6">{t('Gruppen für private Freigaben', 'Groups for private sharing')}</Typography>
    <Typography variant="body2">{t('Mitglieder erhalten Zugriff auf alle Einträge, die mit dieser Gruppe geteilt wurden. Nur HQ-Admins ändern die Mitgliedschaft.', 'Members gain access to every record shared with this group. Only HQ admins change membership.')}</Typography>
    {groups.error && <Alert severity="error">{groups.error.message}</Alert>}
    <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
      {(groups.data ?? []).map(g => <Button key={g.id} title={t('Gruppe bearbeiten', 'Edit group')} onClick={() => setEditing(g)}>{g.name} ({g.memberIds.length})</Button>)}
      <Button title={t('Gruppe erstellen', 'Create group')} onClick={() => setEditing('new')}>{t('Gruppe hinzufügen', 'Add group')}</Button>
    </Stack>{editing && <GroupEditor key={editing === 'new' ? 'new' : `${editing.id}:${editing.revision}`} group={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
  </Paper>;
}
