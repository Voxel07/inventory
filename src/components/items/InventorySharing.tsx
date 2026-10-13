import { useAuth } from '../../hooks/useAuth';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Box, Checkbox, Chip, FormControlLabel, Paper, Stack, Switch, TextField, Typography } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { getAccessGroups, getAccessPeople, saveInventoryAccess } from '../../services/inventoryAccessService';
import type { InventoryAccess, InventoryGrant } from '../../types/inventoryAccess';
import { useLocalizedText } from '../../utils/naming';
import { canManageUsers } from '../../utils/access';

type Source = InventoryAccess['sources'][number];

function SharingEditor({ kind, id, access, onClose }: { kind: string; id: string; access: InventoryAccess; onClose: () => void }) {
  const t = useLocalizedText();
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
    ...(groups.data ?? []).map(g => ({ key: `group:${g.id}`, label: `${t('Gruppe', 'Group')}: ${g.name}`, groupId: g.id, userId: undefined as string | undefined })),
  ];
  const key = (g: InventoryGrant) => g.userId ? `user:${g.userId}` : `group:${g.groupId}`;
  const selected = principals.filter(p => grants.some(g => key(g) === p.key));
  return <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t('Freigaben verwalten', 'Manage sharing')}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Alert severity="info">{kind === 'storage-locations'
        ? t('Eigentümer und Inventar-Admins haben immer Zugriff. Freigaben eines Lagerorts gelten auch für seine privaten Unterorte und alles, was dort gelagert ist.', 'The owner and inventory admins always have access. Shares of a location also apply to its private sub-locations and everything stored there.')
        : t('Eigentümer und Inventar-Admins haben immer Zugriff. Neue Freigaben erlauben nur das Ansehen. Freigaben des Lagerorts gelten zusätzlich.', 'The owner and inventory admins always have access. New shares allow viewing only. Shares of the storage location apply as well.')}</Alert>
      {kind === 'items' && <FormControlLabel label={t('Zur Nutzung anbieten: Mitglieder der Organisation sehen den Artikel (nur lesen) und können ihn anfragen. Du wirst bei Anfragen benachrichtigt; die Ausgabe braucht deine Zusage.', 'Offer for use: organization members see this item (read only) and can request it. You are notified about requests; handing it out needs your commitment.')}
        control={<Switch checked={publicUse} disabled={save.isPending} onChange={(_, checked) => setPublicUse(checked)} />} />}
      {(people.error || groups.error) && <Alert severity="error">{(people.error ?? groups.error)?.message}</Alert>}
      <Autocomplete multiple options={principals} value={selected} getOptionLabel={p => p.label}
        isOptionEqualToValue={(a, b) => a.key === b.key} disabled={save.isPending || people.isLoading || groups.isLoading}
        onChange={(_, values) => setGrants(values.map(p => ({ userId: p.userId, groupId: p.groupId, canEdit: grants.find(g => key(g) === p.key)?.canEdit ?? false })))}
        renderInput={params => <TextField {...params} label={t('Personen und Gruppen', 'People and groups')} />} />
      {selected.map(p => <FormControlLabel key={p.key} label={`${p.label} — ${t('Bearbeiten erlauben', 'Allow editing')}`}
        control={<Checkbox checked={grants.find(g => key(g) === p.key)?.canEdit ?? false} disabled={save.isPending}
          onChange={(_, checked) => setGrants(grants.map(g => key(g) === p.key ? { ...g, canEdit: checked } : g))} />} />)}
      {canManageUsers(user) && <Autocomplete options={people.data ?? []} getOptionLabel={p => p.name}
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

export function InventorySharing({ kind, id, access }: { kind: 'items' | 'storage-locations' | 'assemblies'; id: string; access?: InventoryAccess }) {
  const t = useLocalizedText();
  const [open, setOpen] = useState(false);
  if (!access?.privateResource) return null;
  const sourceLabel = (source: Source) => {
    switch (source.kind) {
      case 'group': return `${t('Gruppe', 'Group')}: ${source.name}`;
      case 'owner': return t('Eigentümer', 'Owner');
      case 'admin': return t('Inventar-Admin', 'Inventory admin');
      case 'location': return `${t('Über Lagerort', 'Via location')}: ${source.name}`;
      case 'public_use': return t('Zur Nutzung angeboten', 'Offered for use');
      default: return t('Direkte Freigabe', 'Direct share');
    }
  };
  const inherited = access.inherited ?? [];
  const owner = access.ownerName ?? '';
  return <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}><Stack spacing={1}>
    <Typography variant="subtitle2">{t('Zugriff & Freigaben', 'Access & sharing')}</Typography>
    <Box><Chip label={t('Privat', 'Private')} color="info" size="small" />{access.publicUse && <> <Chip label={t('Zur Nutzung angeboten', 'Offered for use')} color="success" size="small" /></>} <Typography component="span">{t('Eigentümer', 'Owner')}: {access.ownerName}</Typography></Box>
    <Typography variant="body2">{access.canManage
      ? t('Nur du, Inventar-Admins, freigegebene Personen oder Gruppen und die Freigaben des Lagerorts sehen diesen Eintrag.', 'Only you, inventory admins, shared people or groups and the shares of its storage location can see this record.')
      : access.sources.some(source => source.kind === 'public_use')
      ? t(`${owner} bietet diesen Artikel zur Nutzung an. Du kannst ihn anfragen, aber nicht ändern.`, `${owner} offers this item for use. You can request it but not change it.`)
      : t('Dieser private Eintrag wurde für dich freigegeben. Du kannst die Freigaben nicht ändern.', 'This private record is shared with you. You cannot change its permissions.')}</Typography>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>{access.sources.map(source => <Chip
      key={`${source.kind}:${source.principalId}`} size="small" variant="outlined"
      label={`${sourceLabel(source)} · ${source.canEdit ? t('Bearbeiten', 'Edit') : t('Ansehen', 'View')}`} />)}</Stack>
    {access.canManage && inherited.length > 0 && <Box>
      <Typography variant="caption" color="text.secondary">{t('Zusätzlich über den Lagerort', 'Also through the storage location')}</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>{inherited.map(share => <Chip
        key={`${share.locationId}:${share.kind}:${share.principalId}`} size="small" variant="outlined"
        label={`${share.locationName} · ${share.kind === 'owner' ? `${t('Eigentümer des Lagerorts', 'Location owner')}: ${share.name}` : share.kind === 'group' ? `${t('Gruppe', 'Group')}: ${share.name}` : share.name} · ${share.canEdit ? t('Bearbeiten', 'Edit') : t('Ansehen', 'View')}`} />)}</Stack>
    </Box>}
    {access.canManage && <Button title={t('Freigaben verwalten', 'Manage sharing')} onClick={() => setOpen(true)}>{t('Freigaben verwalten', 'Manage sharing')} ({access.grants.length})</Button>}
  </Stack>{open && <SharingEditor key={`${id}:${access.revision}`} kind={kind} id={id} access={access} onClose={() => setOpen(false)} />}</Paper>;
}
