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
  if (role === 'admin') return 'admin';
  if (role === 'manager' || role === 'inventory_manager') return 'inventory_manager';
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

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{user.name || user.username || user.email}</Typography>
          <Typography variant="body2" color="text.secondary">{user.email}</Typography>
        </Box>
        <TextField select label={t('Rolle', 'Role')} value={role} onChange={(event) => setRole(event.target.value as AccessRole)} sx={{ minWidth: 210 }}>
          <MenuItem value="admin">{t('Administrator', 'Administrator')}</MenuItem>
          <MenuItem value="inventory_manager">{t('Inventarverwaltung', 'Inventory manager')}</MenuItem>
          <MenuItem value="faction_leader">{t('Fraktionsleitung', 'Faction leader')}</MenuItem>
        </TextField>
        <Autocomplete
          multiple
          options={factionOptions}
          value={factionOptions.filter((option) => factions.includes(option))}
          onChange={(_event, values) => setFactions(values)}
          disabled={role !== 'faction_leader'}
          renderInput={(params) => <TextField {...params} label={t('Zugewiesene Fraktionen', 'Assigned factions')} />}
          sx={{ flex: '2 1 360px' }}
        />
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={save.isPending || (role === 'faction_leader' && factions.length === 0)}
          onClick={() => save.mutate({ userId: user.id, data: { role, faction: role === 'faction_leader' ? factions : [] } }, {
            onSuccess: () => showSnackbar(t('Zugriffsrechte gespeichert', 'Access rights saved'), 'success'),
            onError: () => showSnackbar(t('Zugriffsrechte konnten nicht gespeichert werden', 'Could not save access rights'), 'error'),
          })}
        >
          {t('Speichern', 'Save')}
        </Button>
      </Stack>
    </Paper>
  );
}

export function UserManagement() {
  const t = useTranslate();
  const { data: users = [], isLoading, isError } = useUsers();
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1 }}>{t('Benutzerverwaltung', 'User management')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {t('Authentik-Rollen und mehrere Fraktionszuordnungen serverseitig verwalten.', 'Manage Authentik roles and multiple faction assignments on the server.')}
      </Typography>
      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Benutzer konnten nicht geladen werden. Prüfen Sie OIDC und die API-Berechtigungen.', 'Users could not be loaded. Check OIDC and API permissions.')}</Alert>}
      <Stack spacing={1.5}>
        {isLoading ? <Paper sx={{ p: 3 }}>{t('Benutzer werden geladen …', 'Loading users…')}</Paper> : users.map((user) => <UserPermissionsEditor key={user.id} user={user} />)}
      </Stack>
    </Box>
  );
}
