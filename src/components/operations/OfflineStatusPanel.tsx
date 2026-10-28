import { Alert, Stack, type AlertColor } from '@mui/material';
import { useEffect, useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../shared/ActionButtons';
import { downloadOfflineCatalog, getSnapshotStatus, restoreSnapshotStatus, subscribeSnapshot } from '../../services/offlineSnapshot';
import { flushOfflineQueue } from '../../services/offlineQueue';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useT } from '../../utils/naming';

export function OfflineStatusPanel() {
  const { online, queued, sync, syncIssues } = useOfflineStatus();
  const t = useT();
  const snapshot = useSyncExternalStore(subscribeSnapshot, getSnapshotStatus);
  useEffect(() => { void restoreSnapshotStatus().catch(() => {}); }, []);
  const synchronize = useMutation({
    mutationFn: async () => {
      await flushOfflineQueue({ resume: true });
      await downloadOfflineCatalog();
    },
  });
  const syncing = synchronize.isPending || snapshot.kind === 'downloading';
  let severity: AlertColor = 'info';
  let status = t('operations.offlineStatusPanel.notReady');

  if (!online) {
    status = t('operations.offlineStatusPanel.offline');
  } else if (syncing) {
    status = t('operations.offlineStatusPanel.syncing');
  } else if (sync.kind === 'paused') {
    severity = 'error';
    status = t('operations.offlineStatusPanel.synchronizationPaused');
  } else if (sync.kind === 'retrying') {
    severity = 'warning';
    status = t('operations.offlineStatusPanel.retrying');
  } else if (synchronize.isError || snapshot.kind === 'partial') {
    severity = 'warning';
    status = t('operations.offlineStatusPanel.incomplete');
  } else if (syncIssues > 0) {
    severity = 'warning';
    status = t('operations.offlineStatusPanel.needsAttention');
  } else if (queued > 0) {
    status = t('header.queuedActions', { count: queued });
  } else if (snapshot.kind === 'complete') {
    severity = 'success';
    status = t('operations.offlineStatusPanel.ready');
  }

  return <Stack spacing={2}>
    <Alert severity={severity} role="status" aria-live="polite">{status}</Alert>
    <Button variant="outlined" disabled={!online || syncing} onClick={() => synchronize.mutate()}>
      {t('operations.offlineStatusPanel.syncNow')}
    </Button>
  </Stack>;
}
