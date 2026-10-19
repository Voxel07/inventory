import { formatDateTime } from '../utils/dateFormat';
import { OperationListEntry } from '../components/operations/OperationListEntry';
import { Tab, Button } from '../components/shared/ActionButtons';
import { LoansPanel } from '../components/operations/LoansPanel';
import { OrderPreparationPanel } from '../components/operations/OrderPreparationPanel';
import { useQuery } from '@tanstack/react-query';
import { ReportsPanel } from '../components/operations/ReportsPanel';
import { Alert, Box, Chip, LinearProgress, Stack, Tabs, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { PageHeader } from '../components/shared/PageHeader';
import { StateMessage } from '../components/common/StateMessage';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { canManagePurchasing, canManageUsers, canOperateWarehouse, canPerformMaintenance } from '../utils/access';
import { translate, useT } from '../utils/naming';
import { TransfersPanel, CountsPanel, LotsPanel } from '../components/operations/StockOperations';
import { RepairsPanel, SchedulesPanel } from '../components/operations/LifecycleOperations';
import { PurchasingPanel, ReceiptsPanel, VendorsPanel } from '../components/operations/PurchasingOperations';
import { operationsApi } from '../services/operationsService';
import { useOperationCommand, useOperationList } from '../hooks/useOperations';

type Section = { key: string; label: string; component: ReactNode };
type Group = { key: string; label: string; sections: Section[] };

export function Operations() {
  const t = useT(); const { user } = useAuth(); const [params, setParams] = useSearchParams();
  const warehouse = canOperateWarehouse(user);
  const purchasing = canManagePurchasing(user);
  const groups: Group[] = ([
    { key: 'picking', label: t('pages.operations.picking'), sections: warehouse ? [
      { key: 'order-preparation', label: t('pages.operations.ordersToPrepare'), component: <OrderPreparationPanel /> },
    ] : [] },
    { key: 'stock', label: t('common.stock'), sections: warehouse ? [
      { key: 'transfers', label: t('pages.operations.transfers'), component: <TransfersPanel /> },
      { key: 'counts', label: t('pages.operations.stockCounts'), component: <CountsPanel /> },
      { key: 'lots', label: t('pages.operations.lots'), component: <LotsPanel /> },
      { key: 'loans', label: t('pages.operations.borrowingRental'), component: <LoansPanel /> },
    ] : [] },
    { key: 'purchasing', label: t('pages.operations.purchasing'), sections: [
      ...(purchasing ? [{ key: 'purchases', label: t('pages.operations.purchaseOrders'), component: <PurchasingPanel /> }] : []),
      ...(warehouse ? [{ key: 'receipts', label: t('pages.operations.receiving'), component: <ReceiptsPanel /> }] : []),
      ...(purchasing ? [{ key: 'vendors', label: t('pages.operations.suppliers'), component: <VendorsPanel /> }] : []),
    ] },
    { key: 'maintenance', label: t('enum.reason.maintenance'), sections: canPerformMaintenance(user) ? [
      { key: 'repairs', label: t('pages.operations.repairs'), component: <RepairsPanel /> },
      { key: 'schedules', label: t('pages.operations.schedules'), component: <SchedulesPanel /> },
    ] : [] },
    { key: 'reporting', label: t('pages.operations.reports'), sections: warehouse ? [
      { key: 'reports', label: t('pages.operations.operationalReports'), component: <ReportsPanel /> },
    ] : [] },
    { key: 'system', label: t('pages.operations.system'), sections: canManageUsers(user) ? [
      { key: 'system', label: t('pages.operations.systemHealth'), component: <SystemPanel /> },
    ] : [] },
  ] satisfies Group[]).filter((group) => group.sections.length > 0);
  const requested = params.get('tab');
  const group = groups.find((entry) => entry.sections.some((section) => section.key === requested)) ?? groups[0];
  const active = group?.sections.find((section) => section.key === requested) ?? group?.sections[0];
  const select = (key: string) => setParams(current => { current.set('tab', key); return current; });
  if (!group || !active) return <StateMessage kind="empty" title={t('pages.operations.noOperationalTasksAvailable')}
    description={t('pages.operations.theseTasksRequireTheWarehouseCrewOrInventoryAdminRole')} />;
  return <Box sx={{
    '& .MuiTableCell-root': { px: 1, py: 0.75 },
    '& a:not(.MuiButton-root)': { color: 'text.primary', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
  }}>
    <PageHeader title={t('pages.operations.warehouseTasks')} />
    <Tabs value={group.key} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={t('pages.operations.taskAreas')}
      onChange={(_, value: string) => select(groups.find((entry) => entry.key === value)!.sections[0].key)}>
      {groups.map((entry) => <Tab key={entry.key} value={entry.key} label={entry.label} id={`operations-group-${entry.key}`} aria-controls="operations-group-panel" />)}
    </Tabs>
    <Box id="operations-group-panel" role="tabpanel" aria-labelledby={`operations-group-${group.key}`} sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
      {group.sections.length > 1 && <Tabs value={active.key} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
        aria-label={t('pages.operations.labelSections', { label: String(group.label) })} onChange={(_, value: string) => select(value)}
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
  const t = useT(); const status = useQuery({ queryKey: ['operations', 'outbox'], queryFn: operationsApi.outboxStatus });
  const dead = useOperationList('dead-letters', operationsApi.deadLetters); const sync = useOperationList('sync-audit', operationsApi.syncAudit); const command = useOperationCommand();
  return <Stack spacing={2}>
    <Typography variant="h6">{t('pages.operations.eventDelivery')}</Typography>
    {(status.isLoading || dead.isLoading || sync.isLoading) && <LinearProgress />}
    {(status.error || dead.error || sync.error || command.error) && <Alert severity="error">{(status.error || dead.error || sync.error || command.error)?.message}</Alert>}
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>{Object.entries(status.data?.counts ?? {}).map(([key, value]) => <Chip key={key} label={`${key}: ${value}`} />)}</Stack>
    <Typography variant="body2">{t('pages.operations.updated')}: {status.dataUpdatedAt ? formatDateTime(status.dataUpdatedAt) : '—'}</Typography>
    <Button title={translate('pages.operations.refreshSystemStatusAndFailedDeliveries')} onClick={() => { void status.refetch(); void dead.refetch(); void sync.refetch(); }}>{t('pages.operations.refresh')}</Button>
    {dead.data?.map((event) => <OperationListEntry key={event.id} actions={[{ key: 'retry', label: t('pages.operations.retryDelivery'), title: translate('pages.operations.retryDeliveryOfThisFailedEvent'), pinned: true, disabled: command.isPending, onClick: () => command.mutate(() => operationsApi.retryEvent(event.id)) }]} title={<>{event.eventType}</>}><Typography>{event.aggregateType} · {event.aggregateId} · {event.attemptCount} {t('pages.operations.attempts')}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{event.lastError}</Typography></OperationListEntry>)}
    {!dead.isLoading && !dead.data?.length && <Alert severity="success">{t('pages.operations.noDeadLetterEvents')}</Alert>}
    <Typography variant="h6">{t('pages.operations.syncAudit')}</Typography>
    {sync.data?.map((entry) => <OperationListEntry key={entry.id} status={entry.syncStatus} title={<>{entry.operationType} · {formatDateTime(entry.createdAt)}</>}><Typography sx={{ overflowWrap: 'anywhere' }}>{entry.commandId}</Typography>{entry.conflictMessage && <Alert severity="warning">{entry.conflictMessage}</Alert>}</OperationListEntry>)}
  </Stack>;
}

