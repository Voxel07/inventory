import type { AccessRole } from '../types';
import { useT } from '../utils/naming';

export function useRoleLabels(): Record<AccessRole, string> {
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
