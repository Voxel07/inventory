import { Avatar, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import BadgeIcon from '@mui/icons-material/Badge';
import GroupsIcon from '@mui/icons-material/Groups';
import { useAuth } from '../hooks/useAuth';
import { useT, type TranslationKey } from '../utils/naming';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { factionKeyOf } from '../utils/access';
import { InstallAppCard } from '../components/shared/InstallAppCard';
import { NtfySettingsCard } from '../components/shared/NtfySettingsCard';

const ROLE_KEYS: Record<string, TranslationKey> = {
  admin: 'profile.roles.admin',
  warehouse_crew: 'profile.roles.warehouseCrew',
  ash: 'profile.roles.ash',
  faction_leader: 'profile.roles.factionLeader',
  read_only: 'profile.roles.readOnly',
  tenant: 'profile.roles.tenant',
};

export function Profile() {
  const { user } = useAuth();
  const t = useT();
  const role = user?.role?.trim().toLowerCase() ?? '';
  const displayName = user?.name?.trim() || user?.email || t('profile.unknownUser');
  const { factions } = useFactionCatalog();
  const factionLabel = (key: string) => {
    const faction = factions.find((candidate) => factionKeyOf(candidate) === key);
    return faction ? `${faction.eventType} · ${faction.name}` : key;
  };
  const assignedFactions = [...new Set(user?.faction ?? [])].map(factionLabel).sort((left, right) => left.localeCompare(right));

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        {t('profile.title')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: { xs: 2.5, sm: 4 } }}>
        {t('profile.subtitle')}
      </Typography>

      <Paper sx={{ overflow: 'hidden' }}>
        <Box
          sx={{
            height: 8,
            bgcolor: 'primary.main',
          }}
        />
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 2, sm: 3 }}
          sx={{
            p: { xs: 2.5, sm: 4 },
            alignItems: { xs: 'flex-start', sm: 'center' },
          }}
        >
          <Avatar
            sx={{
              width: { xs: 64, sm: 80 },
              height: { xs: 64, sm: 80 },
              bgcolor: 'secondary.main',
            }}
          >
            <AccountCircleIcon sx={{ fontSize: { xs: 46, sm: 58 } }} />
          </Avatar>

          <Stack spacing={2} sx={{ minWidth: 0, flex: 1 }}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                {t('profile.name')}
              </Typography>
              <Typography variant="h5" sx={{ overflowWrap: 'anywhere' }}>
                {displayName}
              </Typography>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {t('profile.role')}
              </Typography>
              <Stack direction="row" useFlexGap sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                {user?.roles.map((assigned) => <Chip key={assigned} icon={<BadgeIcon />} label={t(ROLE_KEYS[assigned])}
                  color={assigned === role ? 'primary' : 'default'} variant="outlined" />)}
              </Stack>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {t('profile.assignedFactions')}
              </Typography>
              {assignedFactions.length ? (
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  {assignedFactions.map((faction) => (
                    <Chip key={faction} icon={<GroupsIcon />} label={faction} variant="outlined" />
                  ))}
                </Stack>
              ) : (
                <Typography color="text.secondary">{t('profile.noAssignedFactions')}</Typography>
              )}
            </Box>
          </Stack>
        </Stack>
      </Paper>
      <NtfySettingsCard />
      <InstallAppCard />
    </Box>
  );
}
