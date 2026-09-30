import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Stack, Typography, Chip, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { getCacheFreshness, getOfflineHistory, flushOfflineQueue, type OfflineHistory } from '../../services/offlineQueue';
import { useOperationList } from '../../hooks/useOperations';
import { apiRequest } from '../../services/apiClient';
import { useOfflineStatus } from '../../hooks/useOfflineStatus';
import { useLocalizedText } from '../../utils/naming';

interface Audit { commandId: string; operationType: string; syncStatus: string; conflictMessage?: string; createdAt: string; supersedes?: string; resolutionNote?: string }
const auditPage = (page: number, size: number) => apiRequest<Audit[]>('/api/sync/audit/mine', { query: { page, size } });
export function OfflineStatusPanel() {
  const { cachedAt } = useOfflineStatus();
  const t = useLocalizedText(); const [history, setHistory] = useState<OfflineHistory[]>([]);
  const cache = useQuery({ queryKey: ['offline-cache-freshness'], queryFn: getCacheFreshness, networkMode: 'always', refetchInterval: 30000 });
  const audit = useOperationList('my-sync-audit', auditPage);
  useEffect(() => { const update = () => { void getOfflineHistory().then(setHistory); }; update(); window.addEventListener('ash-offline-queue', update); return () => window.removeEventListener('ash-offline-queue', update); }, []);
  return <Stack spacing={2}>
    {cachedAt && <Alert severity="warning">{t('Gespeicherte Daten werden verwendet. Ältester betroffener Abruf:', 'Cached data is being used. Oldest affected download:')} {new Date(cachedAt).toLocaleString()}</Alert>}
    <Alert severity="info">{t('Offline möglich: Bestandsbuchungen, Fraktionsbestellungen erstellen/vorbereiten/Status ändern/zurückgeben und Schadenmeldungen ohne neue Fotos. Erst nach Synchronisation verbindlich.', 'Offline: stock transactions, faction order creation/preparation/transitions/returns and damage reports without new photos. Pending actions are confirmed only after synchronization.')}</Alert>
    <Typography variant="body2">{t('Nur online: Fotos und Rückgabe-Einreichungen, allgemeine Bestellungen, Einkauf/Wareneingang, Umlagerung, Inventur, Chargen, Reparatur/Wartung, Stammdaten und Berichtsneuberechnung. Formulare hierfür sind keine dauerhaften Offline-Entwürfe.', 'Online only: photos and return submissions, general orders, purchases/receipts, transfers, counts, lots, repairs/maintenance, catalog changes and report rebuilds. These forms are not durable offline drafts.')}</Typography>
    <Button onClick={() => { void flushOfflineQueue(); void audit.refetch(); void cache.refetch(); }}>{t('Synchronisieren / aktualisieren', 'Sync / refresh')}</Button>
    <Accordion><AccordionSummary>{t('Cache-Aktualität', 'Cache freshness')}</AccordionSummary><AccordionDetails>
      <Alert severity="warning">{t('Cache-Zeit ist der letzte erfolgreiche Abruf. Offline-Bestände sind keine aktuelle Verfügbarkeitszusage.', 'Cache time is the last successful download. Offline balances do not promise current availability.')}</Alert>
      {cache.data?.map((entry) => <Typography key={entry.key} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{entry.key} · {new Date(entry.cachedAt).toLocaleString()}</Typography>)}
      {!cache.data?.length && <Typography>{t('Keine gespeicherten Daten für dieses Konto.', 'No cached data for this account.')}</Typography>}
    </AccordionDetails></Accordion>
    <Accordion><AccordionSummary>{t('Lokaler Aktionsverlauf', 'Local action history')}</AccordionSummary><AccordionDetails>
      {history.map((entry) => <Stack key={entry.idempotencyKey} sx={{ mb: 2 }}><Typography>{entry.type} · {new Date(entry.timestamp).toLocaleString()}</Typography><Chip size="small" label={entry.status} /><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{entry.idempotencyKey}</Typography>{entry.error && <Typography>{entry.error}</Typography>}{entry.resolutionNote && <Typography>{entry.resolutionNote}</Typography>}</Stack>)}
      {!history.length && <Typography>{t('Noch kein Verlauf.', 'No history yet.')}</Typography>}
    </AccordionDetails></Accordion>
    <Accordion><AccordionSummary>{t('Mein Server-Synchronisationsprotokoll', 'My server sync audit')}</AccordionSummary><AccordionDetails>
      {audit.error && <Alert severity="warning">{audit.error.message}</Alert>}
      {audit.data?.map((entry) => <Stack key={entry.commandId} sx={{ mb: 2 }}><Typography>{entry.operationType} · {entry.syncStatus} · {new Date(entry.createdAt).toLocaleString()}</Typography><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{entry.commandId}</Typography>{entry.conflictMessage && <Typography>{entry.conflictMessage}</Typography>}{entry.supersedes && <Typography>{t('Korrigiert', 'Corrects')}: {entry.supersedes} · {entry.resolutionNote}</Typography>}</Stack>)}
    </AccordionDetails></Accordion>
  </Stack>;
}
