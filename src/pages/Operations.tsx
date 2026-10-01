import { Tab, Button } from '../components/shared/ActionButtons';
import { LoansPanel } from '../components/operations/LoansPanel';
import { useQuery } from '@tanstack/react-query';
import { ReportsPanel } from '../components/operations/ReportsPanel';
import { Alert, Card, CardContent, Chip, LinearProgress, Stack, Tabs, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { canManagePurchasing, canManageUsers, canOperateWarehouse, canPerformMaintenance } from '../utils/access';
import { translate, useLocalizedText } from '../utils/naming';
import { TransfersPanel, CountsPanel, LotsPanel } from '../components/operations/StockOperations';
import { RepairsPanel, SchedulesPanel } from '../components/operations/LifecycleOperations';
import { PurchasingPanel, ReceiptsPanel, VendorsPanel } from '../components/operations/PurchasingOperations';
import { operationsApi } from '../services/operationsService';
import { useOperationCommand, useOperationList } from '../hooks/useOperations';

export function Operations() {
  const t = useLocalizedText(); const { user } = useAuth(); const [params, setParams] = useSearchParams();
  const tabs = [
    ...(canOperateWarehouse(user) ? [
      { key: 'transfers', label: t('Umlagerungen', 'Transfers'), component: <TransfersPanel /> },
      { key: 'loans', label: t('Leihe / Miete', 'Borrowing / rental'), component: <LoansPanel /> },
      { key: 'counts', label: t('Inventur', 'Stock counts'), component: <CountsPanel /> },
      { key: 'lots', label: t('Chargen', 'Lots'), component: <LotsPanel /> },
      { key: 'reports', label: t('Berichte', 'Reports'), component: <ReportsPanel /> },
      { key: 'receipts', label: t('Wareneingänge', 'Receipts'), component: <ReceiptsPanel /> },
    ] : []),
    ...(canManagePurchasing(user) ? [
      { key: 'purchases', label: t('Einkauf', 'Purchases'), component: <PurchasingPanel /> },
      { key: 'vendors', label: t('Lieferanten', 'Suppliers'), component: <VendorsPanel /> },
    ] : []),
    ...(canPerformMaintenance(user) ? [
      { key: 'repairs', label: t('Reparaturen', 'Repairs'), component: <RepairsPanel /> },
      { key: 'schedules', label: t('Wartungspläne', 'Maintenance schedules'), component: <SchedulesPanel /> },
    ] : []),
    ...(canManageUsers(user) ? [{ key: 'system', label: t('Systemstatus', 'System health'), component: <SystemPanel /> }] : []),
  ];
  const active = tabs.find((tab) => tab.key === params.get('tab')) ?? tabs[0];
  if (!active) return <Alert severity="info">{t('Für diese Aufgaben ist eine Lager-, Einkaufs- oder Wartungsberechtigung erforderlich.', 'These tasks require warehouse, purchasing or maintenance permission.')}</Alert>;
  return <Stack spacing={2} sx={{
    '& .MuiCardContent-root': { p: 1, '&:last-child': { pb: 1 } },
    '& a:not(.MuiButton-root)': { color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
  }}><Typography variant="h4">{t('Betrieb', 'Operations')}</Typography>
    <Tabs value={active.key} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile onChange={(_, value: string) => setParams({ tab: value })} aria-label={t('Betriebsaufgaben', 'Operational tasks')}>
      {tabs.map((tab) => <Tab title={translate('Den gewählten Betriebsbereich anzeigen', 'Display the selected operations section')} key={tab.key} value={tab.key} label={tab.label} />)}
    </Tabs>{active.component}
  </Stack>;
}

function SystemPanel() {
  const t = useLocalizedText(); const status = useQuery({ queryKey: ['operations', 'outbox'], queryFn: operationsApi.outboxStatus });
  const dead = useOperationList('dead-letters', operationsApi.deadLetters); const sync = useOperationList('sync-audit', operationsApi.syncAudit); const command = useOperationCommand();
  return <Stack spacing={2}>
    <Typography variant="h6">{t('Ereigniszustellung', 'Event delivery')}</Typography>
    {(status.isLoading || dead.isLoading || sync.isLoading) && <LinearProgress />}
    {(status.error || dead.error || sync.error || command.error) && <Alert severity="error">{(status.error || dead.error || sync.error || command.error)?.message}</Alert>}
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>{Object.entries(status.data?.counts ?? {}).map(([key, value]) => <Chip key={key} label={`${key}: ${value}`} />)}</Stack>
    <Typography variant="body2">{t('Aktualisiert', 'Updated')}: {status.dataUpdatedAt ? new Date(status.dataUpdatedAt).toLocaleString() : '—'}</Typography>
    <Button title={translate('Systemstatus und fehlgeschlagene Zustellungen aktualisieren', 'Refresh system status and failed deliveries')} onClick={() => { void status.refetch(); void dead.refetch(); void sync.refetch(); }}>{t('Aktualisieren', 'Refresh')}</Button>
    {dead.data?.map((event) => <Card key={event.id}><CardContent><Typography variant="h6">{event.eventType}</Typography><Typography>{event.aggregateType} · {event.aggregateId} · {event.attemptCount} {t('Versuche', 'attempts')}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{event.lastError}</Typography><Button title={translate('Dieses fehlgeschlagene Ereignis erneut zustellen', 'Retry delivery of this failed event')} disabled={command.isPending} onClick={() => command.mutate(() => operationsApi.retryEvent(event.id))}>{t('Erneut zustellen', 'Retry delivery')}</Button></CardContent></Card>)}
    {!dead.isLoading && !dead.data?.length && <Alert severity="success">{t('Keine dauerhaft fehlgeschlagenen Ereignisse.', 'No dead-letter events.')}</Alert>}
    <Typography variant="h6">{t('Synchronisationsprotokoll', 'Sync audit')}</Typography>
    {sync.data?.map((entry) => <Card key={entry.id}><CardContent><Typography>{entry.operationType} · {entry.syncStatus} · {new Date(entry.createdAt).toLocaleString()}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{entry.commandId}</Typography>{entry.conflictMessage && <Alert severity="warning">{entry.conflictMessage}</Alert>}</CardContent></Card>)}
  </Stack>;
}

