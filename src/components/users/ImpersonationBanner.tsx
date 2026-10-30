import { Alert, Stack } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Button } from '../shared/ActionButtons';
import { useAuth } from '../../hooks/useAuth';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { switchImpersonation } from '../../services/apiClient';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../utils/naming';
import { useRoleLabels } from '../../hooks/useRoleLabels';

/** Always-visible restore controls for account impersonation and development role previews. */
export function ImpersonationBanner() {
  const t = useT();
  const { user, impersonator, isRolePreview, isSwitchingUser } = useAuth();
  const labels = useRoleLabels();
  const { online, queued } = useOfflineStatus();
  if (!user || !impersonator) return null;
  const blocked = !online || queued > 0;
  const stop = () => {
    switchImpersonation(null)
      .catch((error: unknown) => useUIStore.getState().showSnackbar(error instanceof Error ? error.message : String(error), 'error'));
  };
  return <Alert severity="warning" sx={{ mb: 2, flexWrap: 'wrap', '& .MuiAlert-action': { ml: 'auto', pl: 1 } }} action={
    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap' }}>
      {isRolePreview && <Button component={RouterLink} to="/users" color="inherit" size="small">{t('pages.userManagement.changePreviewRole')}</Button>}
      <Button title={blocked ? t('pages.userManagement.switchingBlockedOffline') : undefined} color="inherit" size="small"
        disabled={blocked || isSwitchingUser} onClick={stop}>
        {isRolePreview ? t('pages.userManagement.backToAdmin') : t('pages.userManagement.stopImpersonating', { name: impersonator.name || impersonator.email })}
      </Button>
    </Stack>}>
    {isRolePreview ? t('pages.userManagement.viewingAsRole', { role: labels[user.role] }) : t('pages.userManagement.viewingAsName', { name: user.name || user.email })}
  </Alert>;
}
