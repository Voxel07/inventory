import { InventoryAccessGroups } from '../components/operations/InventoryAccessGroups';
import { Alert, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { useUsers } from '../hooks/useUsers';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import type { AccessRole, Faction, User } from '../types';
import { useLocalizedText } from '../utils/naming';
import { factionKeyOf } from '../utils/access';
import { ListPagination } from '../components/shared/ListPagination';
import { useClientPagination } from '../hooks/useClientPagination';

function RoleLabel({ role }: { role: AccessRole }) {
  const t = useLocalizedText();
  const labels: Record<AccessRole, string> = {
    hq_admin: t('HQ-Administrator', 'HQ administrator'),
    warehouse_crew: t('Lagerteam', 'Warehouse crew'),
    marshal: t('Marshal', 'Marshal'),
    event_planner: t('Eventplanung', 'Event planner'),
    maintenance_crew: t('Wartungsteam', 'Maintenance crew'),
    faction_leader: t('Fraktionsleitung', 'Faction leader'),
    read_only: t('Nur Lesen', 'Read only'),
  };
  return <Chip size="small" label={labels[role] ?? role} />;
}

/** Roles and factions are read-only mirrors of the user's Authentik groups. */
function UserRow({ user, factions }: { user: User; factions: Faction[] }) {
  const factionLabel = (key: string) => {
    const faction = factions.find((candidate) => factionKeyOf(candidate) === key);
    return faction ? `${faction.eventType} · ${faction.name}` : key;
  };
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(180px, 1fr) 210px minmax(260px, 2fr)' }, alignItems: 'center', gap: { xs: 0.75, md: 2 } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{user.name || user.username || user.email}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{user.email}</Typography>
        </Box>
        <Box><RoleLabel role={user.role} /></Box>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {(user.faction ?? []).map((key) => <Chip key={key} size="small" variant="outlined" label={factionLabel(key)} />)}
        </Stack>
      </Box>
    </Paper>
  );
}

export function UserManagement() {
  const t = useLocalizedText();
  const { factions } = useFactionCatalog();
  const { data: users = [], isLoading, isError, hasNextPage, isFetchingNextPage, refetch } = useUsers();
  const { pageItems: pageUsers, page: currentPage, setPage, pageSize, onPageSizeChange } = useClientPagination(users);
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('Benutzerverwaltung', 'User management')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 1.5, sm: 3 } }}>
        {t('Rollen und Fraktionen werden in Authentik über Gruppen vergeben (inventory_<rolle>, inventory_faction_<EVENT>_<kürzel>) und bei jeder Anmeldung übernommen.',
          'Roles and factions are assigned in Authentik through groups (inventory_<role>, inventory_faction_<EVENT>_<slug>) and applied on every sign-in.')}
      </Typography>
      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Benutzer konnten nicht geladen werden. Prüfen Sie OIDC und die API-Berechtigungen.', 'Users could not be loaded. Check OIDC and API permissions.')}</Alert>}
      <Stack spacing={{ xs: 0.75, sm: 1.5 }}>
        {isLoading ? <Paper sx={{ p: 3 }}>{t('Benutzer werden geladen …', 'Loading users…')}</Paper> : pageUsers.map((user) => <UserRow key={user.id} user={user} factions={factions} />)}
      </Stack>
      <ListPagination pageSize={pageSize} onPageSizeChange={onPageSizeChange} count={users.length} page={currentPage} onChange={setPage} loadingMore={!isError && (hasNextPage || isFetchingNextPage)} loadError={isError} onRetry={() => { void refetch(); }} />
      <InventoryAccessGroups />
    </Box>
  );
}
