import { formatDateTime } from '../../utils/dateFormat';
import { AccordionSummary, Button } from '../shared/ActionButtons';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Stack, Typography, Chip, Accordion, AccordionDetails } from '@mui/material';
import { getCacheFreshness, getOfflineHistory, flushOfflineQueue, type OfflineHistory } from '../../services/offlineQueue';
import { useOperationList } from '../../hooks/useOperations';
import { apiPage } from '../../services/apiClient';
import { LoadMore } from '../shared/LoadMore';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { translate, useT } from '../../utils/naming';
import { formatStatus } from '../../utils/formatters';

interface Audit { commandId: string; operationType: string; syncStatus: string; conflictMessage?: string; createdAt: string; supersedes?: string; resolutionNote?: string }
const auditPage = (page: number, size: number) => apiPage<Audit>('/api/sync/audit/mine', page, size);
export function OfflineStatusPanel() {
  const { cachedAt, sync } = useOfflineStatus();
  const t = useT(); const [history, setHistory] = useState<OfflineHistory[]>([]);
  const cache = useQuery({ queryKey: ['offline-cache-freshness'], queryFn: getCacheFreshness, networkMode: 'always', refetchInterval: 30000 });
  const audit = useOperationList('my-sync-audit', auditPage);
  useEffect(() => { const update = () => { void getOfflineHistory().then(setHistory); }; update(); window.addEventListener('ash-offline-queue', update); return () => window.removeEventListener('ash-offline-queue', update); }, []);
  return <Stack spacing={2}>
    {sync.kind === 'paused' && <Alert severity="error">{t('operations.offlineStatusPanel.synchronizationPaused')}: {sync.message}</Alert>}
    {sync.kind === 'retrying' && <Alert severity="warning">{t('operations.offlineStatusPanel.synchronizationRetriesAt')} {formatDateTime(sync.retryAt)}: {sync.message}</Alert>}
    {cachedAt && <Alert severity="warning">{t('operations.offlineStatusPanel.cachedDataIsBeingUsedOldestAffectedDownload')} {formatDateTime(cachedAt)}</Alert>}
    <Alert severity="info">{t('operations.offlineStatusPanel.offlineStockTransactionsFactionOrderCreationPreparationTransitionsReturnsAnd')}</Alert>
    <Typography variant="body2">{t('operations.offlineStatusPanel.onlineOnlyPhotosAndReturnSubmissionsGeneralOrdersPurchasesReceipts')}</Typography>
    <Button title={translate('operations.offlineStatusPanel.sendQueuedOfflineActionsAndRefreshStatus')} onClick={() => { void flushOfflineQueue({ resume: true }); void audit.refetch(); void cache.refetch(); }}>{t('operations.offlineStatusPanel.syncRefresh')}</Button>
    <Accordion><AccordionSummary title={translate('operations.offlineStatusPanel.showOrHideCachedDataFreshness')}>{t('operations.offlineStatusPanel.cacheFreshness')}</AccordionSummary><AccordionDetails>
      <Alert severity="warning">{t('operations.offlineStatusPanel.cacheTimeIsTheLastSuccessfulDownloadOfflineBalancesDo')}</Alert>
      {cache.data?.map((entry) => <Typography key={entry.key} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{entry.key} · {formatDateTime(entry.cachedAt)}</Typography>)}
      {!cache.data?.length && <Typography>{t('operations.offlineStatusPanel.noCachedDataForThisAccount')}</Typography>}
    </AccordionDetails></Accordion>
    <Accordion><AccordionSummary title={translate('operations.offlineStatusPanel.showOrHideLocalActionHistory')}>{t('operations.offlineStatusPanel.localActionHistory')}</AccordionSummary><AccordionDetails>
      {history.map((entry) => <Stack key={entry.idempotencyKey} sx={{ mb: 2 }}><Typography>{entry.type} · {formatDateTime(entry.timestamp)}</Typography><Chip size="small" label={formatStatus(entry.status)} /><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{entry.idempotencyKey}</Typography>{entry.error && <Typography>{entry.error}</Typography>}{entry.resolutionNote && <Typography>{entry.resolutionNote}</Typography>}</Stack>)}
      {!history.length && <Typography>{t('operations.offlineStatusPanel.noHistoryYet')}</Typography>}
    </AccordionDetails></Accordion>
    <Accordion><AccordionSummary title={translate('operations.offlineStatusPanel.showOrHideYourSynchronizationAudit')}>{t('operations.offlineStatusPanel.myServerSyncAudit')}</AccordionSummary><AccordionDetails>
      {audit.error && <Alert severity="warning">{audit.error.message}</Alert>}
      {audit.data?.map((entry) => <Stack key={entry.commandId} sx={{ mb: 2 }}><Typography>{entry.operationType} · {formatStatus(entry.syncStatus)} · {formatDateTime(entry.createdAt)}</Typography><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{entry.commandId}</Typography>{entry.conflictMessage && <Typography>{entry.conflictMessage}</Typography>}{entry.supersedes && <Typography>{t('operations.offlineStatusPanel.corrects')}: {entry.supersedes} · {entry.resolutionNote}</Typography>}</Stack>)}
      <LoadMore list={audit} />
    </AccordionDetails></Accordion>
  </Stack>;
}
