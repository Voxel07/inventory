import { OperationListEntry } from '../components/operations/OperationListEntry';
import { Tab, Button } from '../components/shared/ActionButtons';
import { LoansPanel } from '../components/operations/LoansPanel';
import { useQuery } from '@tanstack/react-query';
import { ReportsPanel } from '../components/operations/ReportsPanel';
import { Alert, Box, Chip, LinearProgress, Stack, Tabs, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { PageHeader } from '../components/shared/PageHeader';
import { StateMessage } from '../components/common/StateMessage';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { canManagePurchasing, canManageUsers, canOperateWarehouse, canPerformMaintenance } from '../utils/access';
import { translate, useLocalizedText } from '../utils/naming';
import { TransfersPanel, CountsPanel, LotsPanel } from '../components/operations/StockOperations';
import { RepairsPanel, SchedulesPanel } from '../components/operations/LifecycleOperations';
import { PurchasingPanel, ReceiptsPanel, VendorsPanel } from '../components/operations/PurchasingOperations';
import { operationsApi } from '../services/operationsService';
import { useOperationCommand, useOperationList } from '../hooks/useOperations';

type Section = { key: string; label: string; component: ReactNode };
type Group = { key: string; label: string; sections: Section[] };

export function Operations() {
  const t = useLocalizedText(); const { user } = useAuth(); const [params, setParams] = useSearchParams();
  const warehouse = canOperateWarehouse(user);
  const purchasing = canManagePurchasing(user);
  const groups: Group[] = ([
    { key: 'stock', label: t('Bestand', 'Stock'), sections: warehouse ? [
      { key: 'transfers', label: t('Umlagerungen', 'Transfers'), component: <TransfersPanel /> },
      { key: 'counts', label: t('Inventur', 'Stock counts'), component: <CountsPanel /> },
      { key: 'lots', label: t('Chargen', 'Lots'), component: <LotsPanel /> },
      { key: 'loans', label: t('Leihe / Miete', 'Borrowing / rental'), component: <LoansPanel /> },
    ] : [] },
    { key: 'purchasing', label: t('Einkauf', 'Purchasing'), sections: [
      ...(purchasing ? [{ key: 'purchases', label: t('Bestellungen', 'Purchase orders'), component: <PurchasingPanel /> }] : []),
      ...(warehouse ? [{ key: 'receipts', label: t('Wareneingang', 'Receiving'), component: <ReceiptsPanel /> }] : []),
      ...(purchasing ? [{ key: 'vendors', label: t('Lieferanten', 'Suppliers'), component: <VendorsPanel /> }] : []),
    ] },
    { key: 'maintenance', label: t('Wartung', 'Maintenance'), sections: canPerformMaintenance(user) ? [
      { key: 'repairs', label: t('Reparaturen', 'Repairs'), component: <RepairsPanel /> },
      { key: 'schedules', label: t('Wartungspläne', 'Schedules'), component: <SchedulesPanel /> },
    ] : [] },
    { key: 'reporting', label: t('Berichte', 'Reports'), sections: warehouse ? [
      { key: 'reports', label: t('Betriebsberichte', 'Operational reports'), component: <ReportsPanel /> },
    ] : [] },
    { key: 'system', label: t('System', 'System'), sections: canManageUsers(user) ? [
      { key: 'system', label: t('Systemstatus', 'System health'), component: <SystemPanel /> },
    ] : [] },
  ] satisfies Group[]).filter((group) => group.sections.length > 0);
  const requested = params.get('tab');
  const group = groups.find((entry) => entry.sections.some((section) => section.key === requested)) ?? groups[0];
  const active = group?.sections.find((section) => section.key === requested) ?? group?.sections[0];
  const select = (key: string) => setParams(current => { current.set('tab', key); return current; });
  if (!group || !active) return <StateMessage kind="empty" title={t('Keine Betriebsaufgaben verfügbar', 'No operational tasks available')}
    description={t('Für diese Aufgaben ist eine Lager-, Einkaufs- oder Wartungsberechtigung erforderlich.', 'These tasks require warehouse, purchasing or maintenance permission.')} />;
  return <Box sx={{
    '& .MuiTableCell-root': { px: 1, py: 0.75 },
    '& a:not(.MuiButton-root)': { color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
  }}>
    <PageHeader title={t('Lageraufgaben', 'Warehouse tasks')} />
    <Tabs value={group.key} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={t('Aufgabenbereiche', 'Task areas')}
      onChange={(_, value: string) => select(groups.find((entry) => entry.key === value)!.sections[0].key)}>
      {groups.map((entry) => <Tab key={entry.key} value={entry.key} label={entry.label} id={`operations-group-${entry.key}`} aria-controls="operations-group-panel" />)}
    </Tabs>
    <Box id="operations-group-panel" role="tabpanel" aria-labelledby={`operations-group-${group.key}`} sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
      {group.sections.length > 1 && <Tabs value={active.key} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
        aria-label={t(`${group.label}: Bereiche`, `${group.label} sections`)} onChange={(_, value: string) => select(value)}
        sx={{ mb: 2, minHeight: 40, '& .MuiTabs-indicator': { display: 'none' }, '& .MuiTab-root': { minHeight: 40, borderRadius: 999, px: 2, mr: 0.5 },
          '& .MuiTab-root.Mui-selected': { bgcolor: 'action.selected' } }}>
        {group.sections.map((section) => <Tab key={section.key} value={section.key} label={section.label} id={`operations-tab-${section.key}`} aria-controls={`operations-panel-${section.key}`} />)}
      </Tabs>}
      <Stack spacing={2} id={`operations-panel-${active.key}`} role={group.sections.length > 1 ? 'tabpanel' : undefined}
        aria-labelledby={group.sections.length > 1 ? `operations-tab-${active.key}` : undefined}
        sx={{ '& > .MuiStack-root > .MuiButton-root': { alignSelf: 'flex-start' } }}>
        {active.component}
      </Stack>
    </Box>
  </Box>;
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
    {dead.data?.map((event) => <OperationListEntry key={event.id} actions={<Button title={translate('Dieses fehlgeschlagene Ereignis erneut zustellen', 'Retry delivery of this failed event')} disabled={command.isPending} onClick={() => command.mutate(() => operationsApi.retryEvent(event.id))}>{t('Erneut zustellen', 'Retry delivery')}</Button>} title={<>{event.eventType}</>}><Typography>{event.aggregateType} · {event.aggregateId} · {event.attemptCount} {t('Versuche', 'attempts')}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{event.lastError}</Typography></OperationListEntry>)}
    {!dead.isLoading && !dead.data?.length && <Alert severity="success">{t('Keine dauerhaft fehlgeschlagenen Ereignisse.', 'No dead-letter events.')}</Alert>}
    <Typography variant="h6">{t('Synchronisationsprotokoll', 'Sync audit')}</Typography>
    {sync.data?.map((entry) => <OperationListEntry key={entry.id} status={entry.syncStatus} title={<>{entry.operationType} · {new Date(entry.createdAt).toLocaleString()}</>}><Typography sx={{ overflowWrap: 'anywhere' }}>{entry.commandId}</Typography>{entry.conflictMessage && <Alert severity="warning">{entry.conflictMessage}</Alert>}</OperationListEntry>)}
  </Stack>;
}

