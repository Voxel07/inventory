import { Chip, Stack } from '@mui/material';
import type { AccessRole } from '../../types';
import { ROLE_LADDER } from '../../types';
import { useRoleLabels } from '../../hooks/useRoleLabels';

const ROLE_COLORS: Record<AccessRole, string> = {
  tenant: '#0e7490',
  read_only: '#475569',
  faction_leader: '#15803d',
  ash: '#7e22ce',
  warehouse_crew: '#1d4ed8',
  admin: '#c2410c',
};

export function UserRoleChips({ roles }: { roles: AccessRole[] }) {
  const labels = useRoleLabels();
  return <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'nowrap', width: 'max-content' }}>
    {ROLE_LADDER.filter(role => roles.includes(role)).reverse().map(role =>
      <Chip key={role} size="small" label={labels[role]} sx={{ bgcolor: ROLE_COLORS[role], color: '#fff' }} />)}
  </Stack>;
}
