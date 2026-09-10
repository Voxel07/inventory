import { Avatar, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import BadgeIcon from '@mui/icons-material/Badge';
import GroupsIcon from '@mui/icons-material/Groups';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../utils/naming';

const ROLE_KEYS: Record<string, string> = {
  warehouse_crew: 'profile.roles.warehouseCrew',
  marshal: 'profile.roles.marshal',
  event_planner: 'profile.roles.eventPlanner',
  maintenance_crew: 'profile.roles.maintenanceCrew',
  hq_admin: 'profile.roles.hqAdmin',
  read_only: 'profile.roles.readOnly',
  faction_leader: 'profile.roles.factionLeader',
};

export function Profile() {
  const { user } = useAuth();
  const t = useT();
  const role = user?.role?.trim().toLowerCase() ?? '';
  const roleLabel = ROLE_KEYS[role]
    ? t(ROLE_KEYS[role])
    : user?.role?.trim() || t('profile.roles.unknown');
  const displayName = user?.name?.trim() || user?.email || t('profile.unknownUser');
  const assignedFactions = [...new Set(user?.faction ?? [])].sort((left, right) => left.localeCompare(right));

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
              <Chip icon={<BadgeIcon />} label={roleLabel} color="primary" variant="outlined" />
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
    </Box>
  );
}
