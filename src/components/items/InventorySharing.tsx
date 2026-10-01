import { useAuth } from '../../hooks/useAuth';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Box, Checkbox, Chip, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { getAccessGroups, getAccessPeople, saveInventoryAccess } from '../../services/inventoryAccessService';
import type { InventoryAccess, InventoryGrant } from '../../types/inventoryAccess';
import { useLocalizedText } from '../../utils/naming';

function SharingEditor({ kind, id, access, onClose }: { kind: string; id: string; access: InventoryAccess; onClose: () => void }) {
  const t = useLocalizedText();
  const client = useQueryClient();
  const { user } = useAuth();
  const [ownerId, setOwnerId] = useState(access.ownerId);
  const people = useQuery({ queryKey: ['access-people'], queryFn: getAccessPeople });
  const groups = useQuery({ queryKey: ['access-groups'], queryFn: getAccessGroups });
  const [grants, setGrants] = useState<InventoryGrant[]>(access.grants);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => saveInventoryAccess(kind, id, { revision: access.revision, grants, reason, ownerId }),
    onSuccess: async () => { await client.invalidateQueries(); onClose(); },
  });
  const principals = [
    ...(people.data ?? []).filter(p => p.id !== access.ownerId).map(p => ({ key: `user:${p.id}`, label: p.name, userId: p.id, groupId: undefined as string | undefined })),
    ...(groups.data ?? []).map(g => ({ key: `group:${g.id}`, label: `${t('Gruppe', 'Group')}: ${g.name}`, groupId: g.id, userId: undefined as string | undefined })),
  ];
  const key = (g: InventoryGrant) => g.userId ? `user:${g.userId}` : `group:${g.groupId}`;
  const selected = principals.filter(p => grants.some(g => key(g) === p.key));
  return <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t('Freigaben verwalten', 'Manage sharing')}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Alert severity="info">{t('Eigentümer und HQ-Admins haben immer Zugriff. Neue Freigaben erlauben nur das Ansehen. Lagerorte benötigen eine eigene Freigabe.', 'The owner and HQ admins always have access. New shares allow viewing only. Storage locations require their own share.')}</Alert>
      {(people.error || groups.error) && <Alert severity="error">{(people.error ?? groups.error)?.message}</Alert>}
      <Autocomplete multiple options={principals} value={selected} getOptionLabel={p => p.label}
        isOptionEqualToValue={(a, b) => a.key === b.key} disabled={save.isPending || people.isLoading || groups.isLoading}
        onChange={(_, values) => setGrants(values.map(p => ({ userId: p.userId, groupId: p.groupId, canEdit: grants.find(g => key(g) === p.key)?.canEdit ?? false })))}
        renderInput={params => <TextField {...params} label={t('Personen und Gruppen', 'People and groups')} />} />
      {selected.map(p => <FormControlLabel key={p.key} label={`${p.label} — ${t('Bearbeiten erlauben', 'Allow editing')}`}
        control={<Checkbox checked={grants.find(g => key(g) === p.key)?.canEdit ?? false} disabled={save.isPending}
          onChange={(_, checked) => setGrants(grants.map(g => key(g) === p.key ? { ...g, canEdit: checked } : g))} />} />)}
      {user?.role === 'hq_admin' && <Autocomplete options={people.data ?? []} getOptionLabel={p => p.name}
        isOptionEqualToValue={(a, b) => a.id === b.id} value={people.data?.find(p => p.id === ownerId) ?? null}
        disabled={save.isPending} onChange={(_, value) => setOwnerId(value?.id ?? access.ownerId)}
        renderInput={params => <TextField {...params} label={t('Eigentümer übertragen (ohne offene Vorgänge)', 'Transfer owner (no outstanding operations)')} />} />}
      <TextField required label={t('Grund für die Änderung', 'Reason for change')} value={reason} disabled={save.isPending} onChange={e => setReason(e.target.value)} />
      <Typography variant="body2">{t('Entfernte Freigaben werden beim Speichern widerrufen. Zugriff über andere Gruppen bleibt bestehen. Heruntergeladene Kopien können nicht zurückgerufen werden.', 'Removed shares are revoked on save. Access through other groups remains. Downloaded copies cannot be recalled.')}</Typography>
      {save.error && <Alert severity="error">{save.error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions><Button title={t('Schließen', 'Close')} disabled={save.isPending} onClick={onClose}>{t('Abbrechen', 'Cancel')}</Button>
      <Button title={t('Freigaben speichern', 'Save sharing')} variant="contained" disabled={!reason.trim() || save.isPending || !people.data || !groups.data} onClick={() => save.mutate()}>{t('Speichern', 'Save')}</Button></DialogActions>
  </Dialog>;
}

export function InventorySharing({ kind, id, access }: { kind: 'items' | 'storage-locations'; id: string; access?: InventoryAccess }) {
  const t = useLocalizedText();
  const [open, setOpen] = useState(false);
  if (!access?.privateResource) return null;
  return <Paper variant="outlined" sx={{ p: 2, my: 2 }}><Stack spacing={1}>
    <Box><Chip label={t('Privat', 'Private')} color="info" size="small" /> <Typography component="span">{t('Eigentümer', 'Owner')}: {access.ownerName}</Typography></Box>
    <Typography variant="body2">{access.canManage
      ? t('Nur du, HQ-Admins und ausdrücklich freigegebene Personen oder Gruppen sehen diesen Eintrag.', 'Only you, HQ admins and explicitly shared people or groups can see this record.')
      : t('Dieser private Eintrag wurde für dich freigegeben. Du kannst die Freigaben nicht ändern.', 'This private record is shared with you. You cannot change its permissions.')}</Typography>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{access.sources.map(source => <Chip
      key={`${source.kind}:${source.principalId}`} size="small" variant="outlined"
      label={`${source.kind === 'group' ? `${t('Gruppe', 'Group')}: ${source.name}` : source.kind === 'owner' ? t('Eigentümer', 'Owner') : source.kind === 'admin' ? 'HQ admin' : t('Direkte Freigabe', 'Direct share')} · ${source.canEdit ? t('Bearbeiten', 'Edit') : t('Ansehen', 'View')}`} />)}</Stack>
    {access.canManage && <Button title={t('Freigaben verwalten', 'Manage sharing')} onClick={() => setOpen(true)}>{t('Freigaben verwalten', 'Manage sharing')} ({access.grants.length})</Button>}
  </Stack>{open && <SharingEditor key={`${id}:${access.revision}`} kind={kind} id={id} access={access} onClose={() => setOpen(false)} />}</Paper>;
}
