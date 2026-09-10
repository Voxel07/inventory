import { useEffect, useState } from 'react';
import { Alert, Autocomplete, Box, Button, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useUpdateUserPermissions, useUsers } from '../hooks/useUsers';
import { EVENT_TYPES, FACTIONS_BY_EVENT, type AccessRole, type User } from '../types';
import { useTranslate } from '../utils/naming';
import { useUIStore } from '../store/uiStore';

const factionOptions = [...new Set(EVENT_TYPES.flatMap((eventType) => FACTIONS_BY_EVENT[eventType]))].sort();

function mappedRole(user: User): AccessRole {
  const role = user.role?.trim().toLowerCase();
  if (role === 'admin' || role === 'hq_admin') return role;
  if (role === 'manager' || role === 'inventory_manager') return 'inventory_manager';
  if (role === 'warehouse_packer' || role === 'warehouse_crew' || role === 'marshal'
    || role === 'event_planner' || role === 'maintenance_crew' || role === 'read_only') return role;
  return 'faction_leader';
}

function UserPermissionsEditor({ user }: { user: User }) {
  const t = useTranslate();
  const save = useUpdateUserPermissions();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [role, setRole] = useState<AccessRole>(mappedRole(user));
  const [factions, setFactions] = useState<string[]>(user.faction ?? []);

  useEffect(() => {
    setRole(mappedRole(user));
    setFactions(user.faction ?? []);
  }, [user]);

  function savePermissions() {
    save.mutate({ userId: user.id, data: { role, faction: role === 'faction_leader' ? factions : [] } }, {
      onSuccess: () => showSnackbar(t('Zugriffsrechte gespeichert', 'Access rights saved'), 'success'),
      onError: () => showSnackbar(t('Zugriffsrechte konnten nicht gespeichert werden', 'Could not save access rights'), 'error'),
    });
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1, md: 2 } }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr) auto',
            md: 'minmax(180px, 1fr) 210px minmax(260px, 2fr) auto',
          },
          alignItems: 'center',
          gap: { xs: 0.75, md: 2 },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>{user.name || user.username || user.email}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{user.email}</Typography>
        </Box>
        <TextField
          select
          size="small"
          label={t('Rolle', 'Role')}
          value={role}
          onChange={(event) => setRole(event.target.value as AccessRole)}
          sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
        >
          <MenuItem value="admin">{t('Administrator', 'Administrator')}</MenuItem>
          <MenuItem value="hq_admin">{t('HQ-Administrator', 'HQ administrator')}</MenuItem>
          <MenuItem value="inventory_manager">{t('Inventarverwaltung', 'Inventory manager')}</MenuItem>
          <MenuItem value="warehouse_packer">{t('Lager / Kommissionierung', 'Warehouse packer')}</MenuItem>
          <MenuItem value="warehouse_crew">{t('Lagerteam', 'Warehouse crew')}</MenuItem>
          <MenuItem value="marshal">{t('Marshal', 'Marshal')}</MenuItem>
          <MenuItem value="event_planner">{t('Eventplanung', 'Event planner')}</MenuItem>
          <MenuItem value="maintenance_crew">{t('Wartungsteam', 'Maintenance crew')}</MenuItem>
          <MenuItem value="faction_leader">{t('Fraktionsleitung', 'Faction leader')}</MenuItem>
          <MenuItem value="read_only">{t('Nur Lesen', 'Read only')}</MenuItem>
        </TextField>
        <Autocomplete
          multiple
          options={factionOptions}
          value={factionOptions.filter((option) => factions.includes(option))}
          onChange={(_event, values) => setFactions(values)}
          disabled={role !== 'faction_leader'}
          size="small"
          limitTags={1}
          renderInput={(params) => <TextField {...params} label={t('Zugewiesene Fraktionen', 'Assigned factions')} />}
          sx={{
            gridColumn: { xs: '1 / -1', md: 'auto' },
            display: { xs: role === 'faction_leader' ? 'block' : 'none', md: 'block' },
          }}
        />
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          size="small"
          aria-label={t('Zugriffsrechte speichern', 'Save access rights')}
          disabled={save.isPending || (role === 'faction_leader' && factions.length === 0)}
          onClick={savePermissions}
          sx={{
            gridColumn: { xs: 2, md: 'auto' },
            gridRow: { xs: 1, md: 'auto' },
            minWidth: { xs: 36, md: 'auto' },
            px: { xs: 0.75, md: 1.5 },
            '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 }, ml: 0 },
          }}
        >
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>{t('Speichern', 'Save')}</Box>
        </Button>
      </Box>
    </Paper>
  );
}

export function UserManagement() {
  const t = useTranslate();
  const { data: users = [], isLoading, isError } = useUsers();
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('Benutzerverwaltung', 'User management')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 1.5, sm: 3 } }}>
        {t('Authentik-Rollen und mehrere Fraktionszuordnungen serverseitig verwalten.', 'Manage Authentik roles and multiple faction assignments on the server.')}
      </Typography>
      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Benutzer konnten nicht geladen werden. Prüfen Sie OIDC und die API-Berechtigungen.', 'Users could not be loaded. Check OIDC and API permissions.')}</Alert>}
      <Stack spacing={{ xs: 0.75, sm: 1.5 }}>
        {isLoading ? <Paper sx={{ p: 3 }}>{t('Benutzer werden geladen …', 'Loading users…')}</Paper> : users.map((user) => <UserPermissionsEditor key={user.id} user={user} />)}
      </Stack>
    </Box>
  );
}
