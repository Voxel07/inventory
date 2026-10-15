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
import { translate, useLocalizedText } from '../../utils/naming';
import { formatStatus } from '../../utils/formatters';

interface Audit { commandId: string; operationType: string; syncStatus: string; conflictMessage?: string; createdAt: string; supersedes?: string; resolutionNote?: string }
const auditPage = (page: number, size: number) => apiPage<Audit>('/api/sync/audit/mine', page, size);
export function OfflineStatusPanel() {
  const { cachedAt, sync } = useOfflineStatus();
  const t = useLocalizedText(); const [history, setHistory] = useState<OfflineHistory[]>([]);
  const cache = useQuery({ queryKey: ['offline-cache-freshness'], queryFn: getCacheFreshness, networkMode: 'always', refetchInterval: 30000 });
  const audit = useOperationList('my-sync-audit', auditPage);
  useEffect(() => { const update = () => { void getOfflineHistory().then(setHistory); }; update(); window.addEventListener('ash-offline-queue', update); return () => window.removeEventListener('ash-offline-queue', update); }, []);
  return <Stack spacing={2}>
    {sync.kind === 'paused' && <Alert severity="error">{t('Synchronisierung angehalten', 'Synchronization paused')}: {sync.message}</Alert>}
    {sync.kind === 'retrying' && <Alert severity="warning">{t('Synchronisierung wird wiederholt um', 'Synchronization retries at')} {formatDateTime(sync.retryAt)}: {sync.message}</Alert>}
    {cachedAt && <Alert severity="warning">{t('Gespeicherte Daten werden verwendet. Ältester betroffener Abruf:', 'Cached data is being used. Oldest affected download:')} {formatDateTime(cachedAt)}</Alert>}
    <Alert severity="info">{t('Offline möglich: Bestandsbuchungen, Fraktionsbestellungen erstellen/vorbereiten/Status ändern/zurückgeben und Schadenmeldungen ohne neue Fotos. Erst nach Synchronisation verbindlich.', 'Offline: stock transactions, faction order creation/preparation/transitions/returns and damage reports without new photos. Pending actions are confirmed only after synchronization.')}</Alert>
    <Typography variant="body2">{t('Nur online: Fotos und Rückgabe-Einreichungen, allgemeine Bestellungen, Einkauf/Wareneingang, Umlagerung, Inventur, Chargen, Reparatur/Wartung, Stammdaten und Berichtsneuberechnung. Formulare hierfür sind keine dauerhaften Offline-Entwürfe.', 'Online only: photos and return submissions, general orders, purchases/receipts, transfers, counts, lots, repairs/maintenance, catalog changes and report rebuilds. These forms are not durable offline drafts.')}</Typography>
    <Button title={translate('Offline-Aktionen senden und den Status aktualisieren', 'Send queued offline actions and refresh status')} onClick={() => { void flushOfflineQueue({ resume: true }); void audit.refetch(); void cache.refetch(); }}>{t('Synchronisieren / aktualisieren', 'Sync / refresh')}</Button>
    <Accordion><AccordionSummary title={translate('Die Aktualität der gespeicherten Daten ein- oder ausblenden', 'Show or hide cached data freshness')}>{t('Cache-Aktualität', 'Cache freshness')}</AccordionSummary><AccordionDetails>
      <Alert severity="warning">{t('Cache-Zeit ist der letzte erfolgreiche Abruf. Offline-Bestände sind keine aktuelle Verfügbarkeitszusage.', 'Cache time is the last successful download. Offline balances do not promise current availability.')}</Alert>
      {cache.data?.map((entry) => <Typography key={entry.key} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{entry.key} · {formatDateTime(entry.cachedAt)}</Typography>)}
      {!cache.data?.length && <Typography>{t('Keine gespeicherten Daten für dieses Konto.', 'No cached data for this account.')}</Typography>}
    </AccordionDetails></Accordion>
    <Accordion><AccordionSummary title={translate('Den lokalen Aktionsverlauf ein- oder ausblenden', 'Show or hide local action history')}>{t('Lokaler Aktionsverlauf', 'Local action history')}</AccordionSummary><AccordionDetails>
      {history.map((entry) => <Stack key={entry.idempotencyKey} sx={{ mb: 2 }}><Typography>{entry.type} · {formatDateTime(entry.timestamp)}</Typography><Chip size="small" label={formatStatus(entry.status)} /><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{entry.idempotencyKey}</Typography>{entry.error && <Typography>{entry.error}</Typography>}{entry.resolutionNote && <Typography>{entry.resolutionNote}</Typography>}</Stack>)}
      {!history.length && <Typography>{t('Noch kein Verlauf.', 'No history yet.')}</Typography>}
    </AccordionDetails></Accordion>
    <Accordion><AccordionSummary title={translate('Das eigene Synchronisationsprotokoll ein- oder ausblenden', 'Show or hide your synchronization audit')}>{t('Mein Server-Synchronisationsprotokoll', 'My server sync audit')}</AccordionSummary><AccordionDetails>
      {audit.error && <Alert severity="warning">{audit.error.message}</Alert>}
      {audit.data?.map((entry) => <Stack key={entry.commandId} sx={{ mb: 2 }}><Typography>{entry.operationType} · {formatStatus(entry.syncStatus)} · {formatDateTime(entry.createdAt)}</Typography><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{entry.commandId}</Typography>{entry.conflictMessage && <Typography>{entry.conflictMessage}</Typography>}{entry.supersedes && <Typography>{t('Korrigiert', 'Corrects')}: {entry.supersedes} · {entry.resolutionNote}</Typography>}</Stack>)}
      <LoadMore list={audit} />
    </AccordionDetails></Accordion>
  </Stack>;
}
