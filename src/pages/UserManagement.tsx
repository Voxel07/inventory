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
import { useT } from '../utils/naming';
import { factionKeyOf } from '../utils/access';
import { ListPagination } from '../components/shared/ListPagination';
import { useClientPagination } from '../hooks/useClientPagination';

function useRoleLabels(): Record<AccessRole, string> {
  const t = useT();
  return {
    admin: t('profile.roles.admin'),
    warehouse_crew: t('profile.roles.warehouseCrew'),
    ash: t('profile.roles.ash'),
    faction_leader: t('profile.roles.factionLeader'),
    read_only: t('profile.roles.readOnly'),
    tenant: t('profile.roles.tenant'),
  };
}

function useRoleDescriptions(): Record<AccessRole, string> {
  const t = useT();
  return {
    tenant: t('pages.userManagement.ownPrivateItemsLocationsAndSharingOnly'),
    read_only: t('pages.userManagement.readCatalogParticipantsTimingAndOrders'),
    faction_leader: t('pages.userManagement.orderListsOfOwnFactions'),
    ash: t('pages.userManagement.generalOrdersAndItemTakeout'),
    warehouse_crew: t('pages.userManagement.catalogOperationsPreparingHandingOutAndTakingBack'),
    admin: t('pages.userManagement.everythingIncludingEventPlanningAndUserRoles'),
  };
}

function AccessEditor({ user, factions, onClose }: { user: User; factions: Faction[]; onClose: () => void }) {
  const t = useT();
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
    <DialogTitle>{t('pages.userManagement.editAccess')}: {user.name || user.email}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Autocomplete multiple options={[...ROLE_LADDER].reverse()} value={roles} getOptionLabel={(role) => labels[role]}
        disabled={save.isPending} onChange={(_, values) => setRoles(values)}
        renderInput={(params) => <TextField {...params} required label={t('pages.userManagement.roles')}
          helperText={roles.length ? descriptions[ROLE_LADDER.filter((role) => roles.includes(role)).at(-1)!] : t('pages.userManagement.selectAtLeastOneRole')} />} />
      <Autocomplete multiple options={options} value={memberships} getOptionLabel={factionLabel} disabled={save.isPending}
        onChange={(_, values) => setMemberships(values)}
        renderInput={(params) => <TextField {...params} label={t('pages.userManagement.factionsEditOrderLists')} />} />
      <TextField required label={t('pages.userManagement.reasonForChange')} value={reason} disabled={save.isPending} onChange={(e) => setReason(e.target.value)} />
      {save.error && <Alert severity="error">{save.error.message}</Alert>}
    </Stack></DialogContent>
    <DialogActions>
      <Button title={t('common.close')} disabled={save.isPending} onClick={onClose}>{t('common.cancel')}</Button>
      <Button title={t('pages.userManagement.saveRolesAndFactions')} variant="contained" disabled={!roles.length || !reason.trim() || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>
    </DialogActions>
  </Dialog>;
}

function UserRow({ user, factions, onEdit }: { user: User; factions: Faction[]; onEdit: () => void }) {
  const t = useT();
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
        <Box><Button title={t('pages.userManagement.changeRoleAndFactions')} size="small" onClick={onEdit}>{t('common.edit')}</Button></Box>
      </Box>
    </Paper>
  );
}

export function UserManagement() {
  const t = useT();
  const { factions } = useFactionCatalog();
  const { data: users = [], isLoading, isError, hasNextPage, isFetchingNextPage, refetch } = useUsers();
  const { pageItems: pageUsers, page: currentPage, setPage, pageSize, onPageSizeChange } = useClientPagination(users);
  const [editing, setEditing] = useState<User | null>(null);
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('nav.userManagement')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 1.5, sm: 3 } }}>
        {t('pages.userManagement.theAuthentikGroupInventoryGrantsAccessToTheInventorySet')}
      </Typography>
      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('pages.userManagement.usersCouldNotBeLoadedCheckOIDCAndAPIPermissions')}</Alert>}
      <Stack spacing={{ xs: 0.75, sm: 1.5 }}>
        {isLoading ? <Paper sx={{ p: 3 }}>{t('pages.userManagement.loadingUsers')}</Paper> : pageUsers.map((user) => <UserRow key={user.id} user={user} factions={factions} onEdit={() => setEditing(user)} />)}
      </Stack>
      <ListPagination pageSize={pageSize} onPageSizeChange={onPageSizeChange} count={users.length} page={currentPage} onChange={setPage} loadingMore={!isError && (hasNextPage || isFetchingNextPage)} loadError={isError} onRetry={() => { void refetch(); }} />
      {editing && <AccessEditor key={`${editing.id}:${editing.revision ?? 0}`} user={editing} factions={factions} onClose={() => setEditing(null)} />}
      <InventoryAccessGroups />
    </Box>
  );
}
