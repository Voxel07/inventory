import { useState, useSyncExternalStore } from 'react';
import { Alert, DialogContent, DialogTitle, Paper, Stack, Typography } from '@mui/material';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import { Button } from './ActionButtons';
import { Dialog } from './ClosableDialog';
import { useT } from '../../utils/naming';
import { getPwaInstallationState, installPwa, subscribePwaInstallation } from '../../services/pwaInstallation';

export function InstallAppCard({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { installed, prompt } = useSyncExternalStore(subscribePwaInstallation, getPwaInstallationState);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (installed || !window.isSecureContext) return null;

  async function handleInstall() {
    if (!prompt) {
      setShowInstructions(true);
      return;
    }
    setPending(true);
    setFailed(false);
    try {
      await installPwa();
    } catch {
      setFailed(true);
      setShowInstructions(true);
    } finally {
      setPending(false);
    }
  }

  if (compact) return <>
    <Button size="small" startIcon={<InstallMobileIcon />} onClick={() => void handleInstall()} disabled={pending}>
      {t('pwa.install')}
    </Button>
    <Dialog open={showInstructions} onClose={() => setShowInstructions(false)} maxWidth="xs" fullWidth>
      <DialogTitle>{t('pwa.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {failed && <Alert severity="error">{t('pwa.failed')}</Alert>}
          <Typography variant="body2">{t(isAppleMobile ? 'pwa.appleInstructions' : 'pwa.browserInstructions')}</Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  </>;

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
