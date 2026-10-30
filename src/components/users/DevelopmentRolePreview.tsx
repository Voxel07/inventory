import { Autocomplete, Box, Paper, TextField, ToggleButtonGroup, Typography } from '@mui/material';
import { ToggleButton } from '../shared/ActionButtons';
import { useAuth } from '../../hooks/useAuth';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useRoleLabels } from '../../hooks/useRoleLabels';
import { switchDevelopmentRole } from '../../services/apiClient';
import { useUIStore } from '../../store/uiStore';
import { ROLE_LADDER, type UserRole } from '../../types';
import { factionKeyOf } from '../../utils/access';
import { useT } from '../../utils/naming';

/** The signed-in admin previews each role without creating accounts or editing stored permissions. */
export function DevelopmentRolePreview() {
  const t = useT();
  const labels = useRoleLabels();
  const { user, canPreviewRoles, isSwitchingUser } = useAuth();
  const { factions, isLoading } = useFactionCatalog();
  const { online, queued } = useOfflineStatus();
  const eventType = useUIStore((state) => state.activeEventType);
  if (!canPreviewRoles || !user) return null;
  const blocked = !online || queued > 0;
  const memberships = user.faction ?? [];
  const factionOptions = factions.map(factionKeyOf);
  const factionRole = user.role === 'faction_leader' || user.role === 'ash';

  function change(role: UserRole, scope: readonly string[]) {
    void switchDevelopmentRole(role, scope).catch((error: unknown) => {
      useUIStore.getState().showSnackbar(error instanceof Error ? error.message : String(error), 'error');
    });
  }

  return <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
    <Typography variant="subtitle1" id="development-role-preview-label" sx={{ fontWeight: 700, mb: 1 }}>
      {t('pages.userManagement.viewSystemAs')}
    </Typography>
    <ToggleButtonGroup exclusive value={user.role} disabled={blocked || isSwitchingUser}
      aria-labelledby="development-role-preview-label" sx={{ display: 'flex', flexWrap: 'wrap', mb: 1 }}
      onChange={(_, role: UserRole | null) => {
        if (!role || role === user.role) return;
        const firstFaction = factions.find((faction) => faction.eventType === eventType) ?? factions[0];
        change(role, role === 'faction_leader' || role === 'ash'
          ? memberships.length ? memberships : firstFaction ? [factionKeyOf(firstFaction)] : []
          : []);
      }}>
      {[...ROLE_LADDER].reverse().map((role) => <ToggleButton key={role} value={role} sx={{ minHeight: 44 }}
        title={blocked ? t('pages.userManagement.switchingBlockedOffline') : undefined}>{labels[role]}</ToggleButton>)}
    </ToggleButtonGroup>
    <Typography variant="body2" color="text.secondary">
      {blocked ? t('pages.userManagement.switchingBlockedOffline') : t('pages.userManagement.rolePreviewHelp')}
    </Typography>
    {factionRole && <Box sx={{ mt: 2 }}>
      <Autocomplete multiple options={factionOptions} value={memberships} loading={isLoading}
        disabled={blocked || isSwitchingUser || isLoading}
        getOptionLabel={(key) => {
          const faction = factions.find((candidate) => factionKeyOf(candidate) === key);
          return faction ? `${faction.eventType} · ${faction.name}` : key;
        }}
        onChange={(_, values) => change(user.role, values)}
        renderInput={(params) => <TextField {...params} size="small" label={t('pages.userManagement.previewFactions')}
          helperText={t('pages.userManagement.previewFactionsHelp')} />} />
    </Box>}
  </Paper>;
}
