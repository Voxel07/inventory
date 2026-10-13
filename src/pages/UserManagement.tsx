import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InventoryAccessGroups } from '../components/operations/InventoryAccessGroups';
import { Alert, Autocomplete, Box, Chip, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material';
import { Button } from '../components/shared/ActionButtons';
import { Dialog } from '../components/shared/ClosableDialog';
import { useAuth } from '../hooks/useAuth';
import { useUsers } from '../hooks/useUsers';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { refreshCurrentUser } from '../services/apiClient';
import { updateUserAccess } from '../services/userService';
import { ROLE_LADDER } from '../types';
import type { AccessRole, Faction, User } from '../types';
import { useLocalizedText } from '../utils/naming';
import { factionKeyOf } from '../utils/access';
import { ListPagination } from '../components/shared/ListPagination';
import { useClientPagination } from '../hooks/useClientPagination';

function useRoleLabels(): Record<AccessRole, string> {
  const t = useLocalizedText();
  return {
    admin: t('Inventar-Admin', 'Inventory admin'),
    warehouse_crew: t('Lagerteam', 'Warehouse crew'),
    ash: t('ASH-Crew', 'ASH crew'),
    faction_leader: t('Fraktionsleitung', 'Faction leader'),
    read_only: t('Nur Lesen', 'Read only'),
    tenant: t('Mieter', 'Tenant'),
  };
}

function useRoleDescriptions(): Record<AccessRole, string> {
  const t = useLocalizedText();
  return {
    tenant: t('Nur eigene private Sachen, Lagerorte und Freigaben', 'Own private items, locations and sharing only'),
    read_only: t('Katalog, Teilnehmer, Zeitplan und Bestellungen lesen', 'Read catalog, participants, timing and orders'),
    faction_leader: t('Bestelllisten der eigenen Fraktionen', 'Order lists of own factions'),
    ash: t('Allgemeine Bestellungen und Artikelausgabe', 'General orders and item takeout'),
    warehouse_crew: t('Katalog, Lagerbetrieb, Vorbereitung, Ausgabe und Rücknahme', 'Catalog, operations, preparing, handing out and taking back'),
    admin: t('Alles, inklusive Eventplanung und Benutzerrollen', 'Everything, including event planning and user roles'),
  };
}

function AccessEditor({ user, factions, onClose }: { user: User; factions: Faction[]; onClose: () => void }) {
  const t = useLocalizedText();
  const client = useQueryClient();
  const { user: me } = useAuth();
  const labels = useRoleLabels();
  const descriptions = useRoleDescriptions();
  const [roles, setRoles] = useState<AccessRole[]>(user.roles);
  const [memberships, setMemberships] = useState<string[]>(user.faction ?? []);
  const [reason, setReason] = useState('');
  const save = useMutation({
    mutationFn: () => updateUserAccess(user.id, { roles, factions: memberships, revision: user.revision ?? 0, reason }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['users'] });
      if (user.id === me?.id) await refreshCurrentUser();
      onClose();
    },
  });
  const options = factions.map(factionKeyOf);
  const factionLabel = (key: string) => {
    const faction = factions.find((candidate) => factionKeyOf(candidate) === key);
    return faction ? `${faction.eventType} · ${faction.name}` : key;
  };
  return <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle>{t('Zugriff bearbeiten', 'Edit access')}: {user.name || user.email}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Autocomplete multiple options={[...ROLE_LADDER].reverse()} value={roles} getOptionLabel={(role) => labels[role]}
        disabled={save.isPending} onChange={(_, values) => setRoles(values)}
        renderInput={(params) => <TextField {...params} required label={t('Rollen', 'Roles')}
          helperText={roles.length ? descriptions[ROLE_LADDER.filter((role) => roles.includes(role)).at(-1)!] : t('Mindestens eine Rolle auswählen', 'Select at least one role')} />} />
      <Autocomplete multiple options={options} value={memberships} getOptionLabel={factionLabel} disabled={save.isPending}
        onChange={(_, values) => setMemberships(values)}
        renderInput={(params) => <TextField {...params} label={t('Fraktionen (Bestelllisten bearbeiten)', 'Factions (edit order lists)')} />} />
      <TextField required label={t('Grund für die Änderung', 'Reason for change')} value={reason} disabled={save.isPending} onChange={(e) => setReason(e.target.value)} />
      {save.error && <Alert severity="error">{save.error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions>
      <Button title={t('Schließen', 'Close')} disabled={save.isPending} onClick={onClose}>{t('Abbrechen', 'Cancel')}</Button>
      <Button title={t('Rollen und Fraktionen speichern', 'Save roles and factions')} variant="contained" disabled={!roles.length || !reason.trim() || save.isPending} onClick={() => save.mutate()}>{t('Speichern', 'Save')}</Button>
    </DialogActions>
  </Dialog>;
}

function UserRow({ user, factions, onEdit }: { user: User; factions: Faction[]; onEdit: () => void }) {
  const t = useLocalizedText();
  const labels = useRoleLabels();
  const factionLabel = (key: string) => {
    const faction = factions.find((candidate) => factionKeyOf(candidate) === key);
    return faction ? `${faction.eventType} · ${faction.name}` : key;
  };
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(180px, 1fr) 210px minmax(260px, 2fr) auto' }, alignItems: 'center', gap: { xs: 0.75, md: 2 } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{user.name || user.username || user.email}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{user.email}</Typography>
        </Box>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>{user.roles.map((role) =>
          <Chip key={role} size="small" label={labels[role]} color={role === user.role ? 'primary' : 'default'} />)}</Stack>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {(user.faction ?? []).map((key) => <Chip key={key} size="small" variant="outlined" label={factionLabel(key)} />)}
        </Stack>
        <Box><Button title={t('Rolle und Fraktionen ändern', 'Change role and factions')} size="small" onClick={onEdit}>{t('Bearbeiten', 'Edit')}</Button></Box>
      </Box>
    </Paper>
  );
}

export function UserManagement() {
  const t = useLocalizedText();
  const { factions } = useFactionCatalog();
  const { data: users = [], isLoading, isError, hasNextPage, isFetchingNextPage, refetch } = useUsers();
  const { pageItems: pageUsers, page: currentPage, setPage, pageSize, onPageSizeChange } = useClientPagination(users);
  const [editing, setEditing] = useState<User | null>(null);
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('Benutzerverwaltung', 'User management')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 1.5, sm: 3 } }}>
        {t('Die Authentik-Gruppe „inventory“ gewährt den Zugang zum Inventar. Rollen und Fraktionen legst du hier fest; neue Benutzer starten mit Lesezugriff. Bei mehreren Rollen gilt die mit den meisten Rechten.',
          'The Authentik group "inventory" grants access to the inventory. Set roles and factions here; new users start as read-only. When multiple roles are assigned, the highest role determines access.')}
      </Typography>
      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Benutzer konnten nicht geladen werden. Prüfen Sie OIDC und die API-Berechtigungen.', 'Users could not be loaded. Check OIDC and API permissions.')}</Alert>}
      <Stack spacing={{ xs: 0.75, sm: 1.5 }}>
        {isLoading ? <Paper sx={{ p: 3 }}>{t('Benutzer werden geladen …', 'Loading users…')}</Paper> : pageUsers.map((user) => <UserRow key={user.id} user={user} factions={factions} onEdit={() => setEditing(user)} />)}
      </Stack>
      <ListPagination pageSize={pageSize} onPageSizeChange={onPageSizeChange} count={users.length} page={currentPage} onChange={setPage} loadingMore={!isError && (hasNextPage || isFetchingNextPage)} loadError={isError} onRetry={() => { void refetch(); }} />
      {editing && <AccessEditor key={`${editing.id}:${editing.revision ?? 0}`} user={editing} factions={factions} onClose={() => setEditing(null)} />}
      <InventoryAccessGroups />
    </Box>
  );
}
