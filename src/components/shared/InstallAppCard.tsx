import { useState, useSyncExternalStore } from 'react';
import { Alert, Paper, Stack, Typography } from '@mui/material';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import { Button } from './ActionButtons';
import { useT } from '../../utils/naming';
import { getPwaInstallationState, installPwa, subscribePwaInstallation } from '../../services/pwaInstallation';

export function InstallAppCard() {
  const t = useT();
  const { installed, prompt } = useSyncExternalStore(subscribePwaInstallation, getPwaInstallationState);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (installed || !window.isSecureContext) return null;

  async function handleInstall() {
    setPending(true);
    setFailed(false);
    try {
      await installPwa();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ mt: 3, p: 2.5, width: '100%' }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">{t('pwa.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('pwa.description')}</Typography>
        {prompt ? (
          <Button variant="outlined" startIcon={<InstallMobileIcon />} onClick={() => void handleInstall()} disabled={pending}>
            {t('pwa.install')}
          </Button>
        ) : (
          <Typography variant="body2">
            {t(isAppleMobile ? 'pwa.appleInstructions' : 'pwa.browserInstructions')}
          </Typography>
        )}
        {failed && <Alert severity="error">{t('pwa.failed')}</Alert>}
      </Stack>
    </Paper>
  );
}
