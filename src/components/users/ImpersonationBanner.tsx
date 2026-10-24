import { useState } from 'react';
import { Alert } from '@mui/material';
import { Button } from '../shared/ActionButtons';
import { useAuth } from '../../hooks/useAuth';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { switchImpersonation } from '../../services/apiClient';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../utils/naming';

/** Development only: shown while an administrator acts as another account. */
export function ImpersonationBanner() {
  const t = useT();
  const { user, impersonator } = useAuth();
  const { online, queued } = useOfflineStatus();
  const [pending, setPending] = useState(false);
  if (!user || !impersonator) return null;
  const blocked = !online || queued > 0;
  const stop = () => {
    setPending(true);
    switchImpersonation(null)
      .catch((error: unknown) => useUIStore.getState().showSnackbar(error instanceof Error ? error.message : String(error), 'error'))
      .finally(() => setPending(false));
  };
  return <Alert severity="warning" sx={{ mb: 2 }} action={
    <Button title={blocked ? t('pages.userManagement.switchingBlockedOffline') : undefined} color="inherit" size="small"
      disabled={blocked || pending} onClick={stop}>
      {t('pages.userManagement.stopImpersonating', { name: impersonator.name || impersonator.email })}
    </Button>}>
    {t('pages.userManagement.viewingAsName', { name: user.name || user.email })}
  </Alert>;
}
