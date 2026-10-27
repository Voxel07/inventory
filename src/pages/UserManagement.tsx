import { useState } from 'react';
import { AccountLifecyclePanel } from '../components/operations/AccountLifecyclePanel';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InventoryAccessGroups } from '../components/operations/InventoryAccessGroups';
import { Alert, Autocomplete, Box, Chip, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, useMediaQuery, useTheme } from '@mui/material';
import { Button, MenuItem } from '../components/shared/ActionButtons';
import { Dialog } from '../components/shared/ClosableDialog';
import { ActionMenu } from '../components/shared/ActionBar';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import SwitchAccountIcon from '@mui/icons-material/SwitchAccount';
import { useAuth } from '../hooks/useAuth';
import { useUsers } from '../hooks/useUsers';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { refreshCurrentUser, switchImpersonation } from '../services/apiClient';
import { IMPERSONATION_AVAILABLE } from '../config/runtimeConfig';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useUIStore } from '../store/uiStore';
import { useNavigate } from 'react-router-dom';
import { updateUserAccess } from '../services/userService';
import { ROLE_LADDER } from '../types';
import type { AccessRole, Faction, User } from '../types';
import { useT } from '../utils/naming';
import { canManageUsers, factionKeyOf } from '../utils/access';
import { ServerListPagination } from '../components/shared/ServerListPagination';
import { UserRoleChips } from '../components/users/UserRoleChips';
import { UserAccessHistory } from '../components/users/UserAccessHistory';
import { useRoleLabels } from '../hooks/useRoleLabels';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

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
      <TextField required label={t('pages.userManagement.reasonForChange')} value={reason} disabled={save.isPending}
        slotProps={{ htmlInput: { maxLength: 1000 } }} helperText={t('pages.userManagement.reasonSavedInHistory')}
        onChange={(e) => setReason(e.target.value)} />
      {save.error && <Alert severity="error">{save.error.message}</Alert>}
      <AccountLifecyclePanel user={user} />
    </Stack></DialogContent>
    <DialogActions>
      <Button title={t('common.close')} disabled={save.isPending} onClick={onClose}>{t('common.cancel')}</Button>
      <Button title={t('pages.userManagement.saveRolesAndFactions')} variant="contained" disabled={!roles.length || !reason.trim() || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>
    </DialogActions>
  </Dialog>;
}

/** Development only: offered for other active accounts; switching is blocked offline or with queued offline actions. */
function useImpersonation(user: User) {
  const t = useT();
  const navigate = useNavigate();
  const { user: me, impersonator } = useAuth();
  const { online, queued } = useOfflineStatus();
  const [pending, setPending] = useState(false);
  if (!IMPERSONATION_AVAILABLE || !user.active || user.id === me?.id || user.id === impersonator?.id) return null;
  const blocked = !online || queued > 0;
  return {
    title: blocked ? t('pages.userManagement.switchingBlockedOffline') : t('pages.userManagement.actAsThisAccount'),
    disabled: blocked || pending,
    start: () => {
      setPending(true);
      switchImpersonation(user)
        .then(() => navigate('/'))
        .catch((error: unknown) => {
          setPending(false);
          useUIStore.getState().showSnackbar(error instanceof Error ? error.message : String(error), 'error');
        });
    },
  };
}

function UserRow({ user, factions, compact, onEdit, onHistory }: { user: User; factions: Faction[]; compact: boolean; onEdit: () => void; onHistory: () => void }) {
  const t = useT();
  const impersonation = useImpersonation(user);
  const factionLabel = (key: string) => {
    const faction = factions.find((candidate) => factionKeyOf(candidate) === key);
    return faction ? `${faction.eventType} · ${faction.name}` : key;
  };
  return (
    <TableRow hover>
      <TableCell component="th" scope="row" sx={{ fontWeight: 700, whiteSpace: compact ? undefined : 'nowrap', overflowWrap: 'anywhere' }}>
        {user.name || user.email}
        {compact && user.email && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 400 }}>{user.email}</Typography>}
      </TableCell>
      {!compact && <TableCell sx={{ whiteSpace: 'nowrap' }}>{user.email}</TableCell>}
      <TableCell><UserRoleChips roles={user.roles} /></TableCell>
      {!compact && <TableCell>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, minWidth: 150 }}>
          {(user.faction ?? []).map((key) => <Chip key={key} size="small" variant="outlined" label={factionLabel(key)} />)}
        </Stack>
      </TableCell>}
      {compact ? <TableCell padding="checkbox" align="right"><ActionMenu actions={[
        { key: 'edit', label: t('pages.userManagement.changeRoleAndFactions'), icon: <EditIcon fontSize="small" />, onClick: onEdit },
        { key: 'history', label: t('pages.userManagement.accessHistory'), icon: <HistoryIcon fontSize="small" />, onClick: onHistory },
        ...(impersonation ? [{ key: 'impersonate', label: t('pages.userManagement.impersonate'), icon: <SwitchAccountIcon fontSize="small" />,
          title: impersonation.title, onClick: impersonation.start, disabled: impersonation.disabled }] : []),
      ]} /></TableCell> : <TableCell><Stack direction="row" spacing={0.5}>
        <Button title={t('pages.userManagement.changeRoleAndFactions')} size="small" onClick={onEdit}>{t('common.edit')}</Button>
        <Button title={t('pages.userManagement.accessHistory')} size="small" onClick={onHistory}>{t('common.history')}</Button>
        {impersonation && <Button title={impersonation.title} size="small" disabled={impersonation.disabled}
          onClick={impersonation.start}>{t('pages.userManagement.impersonate')}</Button>}
      </Stack></TableCell>}
    </TableRow>
  );
}

export function UserManagement() {
  const { user } = useAuth();
  return canManageUsers(user) ? <AdminUserManagement /> : null;
}

function AdminUserManagement() {
  const t = useT();
  const labels = useRoleLabels();
  const { factions } = useFactionCatalog();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<AccessRole | ''>('');
  const term = useDebouncedValue(search.trim());
  const [editing, setEditing] = useState<User | null>(null);
  const [history, setHistory] = useState<User | null>(null);
  return <Box>
    <Typography variant="h4" sx={{ mb: 0.5, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('nav.userManagement')}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 1.5, sm: 3 } }}>
      {t('pages.userManagement.theAuthentikGroupInventoryGrantsAccessToTheInventorySet')}
    </Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
      <TextField size="small" label={t('pages.userManagement.searchUsers')} value={search}
        onChange={event => setSearch(event.target.value)} sx={{ flex: 1 }} />
      <TextField select size="small" label={t('pages.userManagement.filterByRole')} value={role}
        onChange={event => setRole(event.target.value as AccessRole | '')} sx={{ minWidth: 220 }}>
        <MenuItem value="">{t('pages.userManagement.allRoles')}</MenuItem>
        {[...ROLE_LADDER].reverse().map(value => <MenuItem key={value} value={value}>{labels[value]}</MenuItem>)}
      </TextField>
    </Stack>
    <UserDirectory key={JSON.stringify([term, role])} search={term} role={role || undefined}
      factions={factions} onEdit={setEditing} onHistory={setHistory} />
    {editing && <AccessEditor key={`${editing.id}:${editing.revision ?? 0}`} user={editing} factions={factions} onClose={() => setEditing(null)} />}
    {history && <UserAccessHistory key={history.id} user={history} factions={factions} onClose={() => setHistory(null)} />}
    <InventoryAccessGroups />
  </Box>;
}

function UserDirectory({ search, role, factions, onEdit, onHistory }: {
  search: string; role?: AccessRole; factions: Faction[]; onEdit: (user: User) => void; onHistory: (user: User) => void;
}) {
  const t = useT();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const result = useUsers(page, size, search, role);
  const users = result.data?.rows ?? [];
  const theme = useTheme();
  // Phones keep name and roles; the e-mail moves under the name, factions show in the access editor.
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const columns = compact ? 3 : 5;
  return (
    <Box>
      {result.isError && <Alert severity="error" sx={{ mb: 2 }}
        action={<Button onClick={() => { void result.refetch(); }}>{t('common.retryLoadingTheData')}</Button>}>
        {t('pages.userManagement.usersCouldNotBeLoadedCheckOIDCAndAPIPermissions')}
      </Alert>}
      <TableContainer component={Paper} variant="outlined"><Table size="small" aria-label={t('nav.userManagement')}>
        <TableHead><TableRow>
          <TableCell>{t('profile.name')}</TableCell>
          {!compact && <TableCell>{t('pages.userManagement.email')}</TableCell>}
          <TableCell>{t('pages.userManagement.roles')}</TableCell>
          {!compact && <TableCell>{t('profile.assignedFactions')}</TableCell>}
          {compact ? <TableCell padding="checkbox" /> : <TableCell>{t('common.actions')}</TableCell>}
        </TableRow></TableHead>
        <TableBody>
          {result.isPending && <TableRow><TableCell colSpan={columns}>{t('pages.userManagement.loadingUsers')}</TableCell></TableRow>}
          {result.isSuccess && !users.length && <TableRow><TableCell colSpan={columns}>{t('pages.userManagement.noUsersFound')}</TableCell></TableRow>}
          {!result.isError && users.map(user => <UserRow key={user.id} user={user} factions={factions} compact={compact}
            onEdit={() => onEdit(user)} onHistory={() => onHistory(user)} />)}
        </TableBody>
      </Table></TableContainer>
      <ServerListPagination page={page} size={size} rowCount={users.length} more={result.data?.more ?? false}
        loading={result.isFetching} onPageChange={setPage} onSizeChange={value => { setSize(value); setPage(0); }} />
    </Box>
  );
}
