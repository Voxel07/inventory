import { formatStatus } from '../../utils/formatters';
import { formatDate } from '../../utils/dateFormat';
import { OperationListEntry } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { scheduleInput } from '../../services/operationsInputs';
import { QueryFeedback } from '../common/QueryFeedback';
import { personOptions } from '../../services/assignmentOptions';
import { createMaintenanceRecord } from '../../services/maintenanceService';
import { LoadMore } from '../shared/LoadMore';
import { oneOf, optionalValues } from '../../utils/operationForm';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ItemAutocomplete } from '../shared/ItemAutocomplete';
import { Alert, Stack, Typography } from '@mui/material';
import { useItemAssets } from '../../hooks/useItems';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import { MAINTENANCE_RESULTS, type Schedule } from '../../types/operations';
import { OperationForm } from './OperationForm';
import type { Values } from '../../types/operationForm';
import { translate, useT } from '../../utils/naming';

export function SchedulesPanel() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const itemId = params.get('itemId') || '';
  const schedules = useOperationList(`schedules:${itemId}`, operationsApi.schedules(itemId ? { itemId } : undefined));
  const [chooseItem, setChooseItem] = useState(false);
  const [edit, setEdit] = useState<{ itemId: string; schedule?: Schedule } | null>(null);
  const assets = useItemAssets(edit?.itemId);
  const [performedAt, setPerformedAt] = useState<number | ''>('');
  const [complete, setComplete] = useState<Schedule | null>(null);
  const [retire, setRetire] = useState<Schedule | null>(null);
  return <Stack spacing={2}>
    <Alert severity="info">{t('operations.review.scheduleRequirements')}</Alert>
    <ItemAutocomplete label={t('common.item')} value={itemId || null} onChange={(item) => setParams(current => {
      if (item) current.set('itemId', item.id); else current.delete('itemId');
      return current;
    })} />
    <Button title={translate('operations.lifecycleOperations.createAMaintenanceScheduleForAnItem')} variant="contained" onClick={() => setChooseItem(true)}>{t('operations.lifecycleOperations.newMaintenanceSchedule')}</Button>
    <QueryFeedback isLoading={schedules.isLoading} error={schedules.error} isEmpty={!schedules.data?.length} emptyMessage={t('operations.lifecycleOperations.noMaintenanceSchedulesYet')} />
    {schedules.data?.map((schedule) => <OperationListEntry key={schedule.id} actions={[
        schedule.active && { key: 'complete', label: t('operations.lifecycleOperations.recordMaintenance'), title: translate('operations.lifecycleOperations.recordCompletedMaintenance'),
          variant: 'contained', pinned: true,
          onClick: () => { setPerformedAt(Date.now()); setComplete(schedule); } },
        { key: 'edit', label: t('common.edit'), title: translate('operations.lifecycleOperations.editThisMaintenanceScheduleSIntervalAndChecklist'),
          onClick: () => setEdit({ itemId: schedule.itemId, schedule }) },
        { key: 'records', label: t('operations.lifecycleOperations.assetMaintenanceRecords'), title: translate('operations.lifecycleOperations.openAssetDetailsAndMaintenanceRecords'),
          to: schedule.assetInstanceId ? `/items/${schedule.itemId}/assets/${schedule.assetInstanceId}` : `/items/${schedule.itemId}` },
        schedule.active && { key: 'retire', label: t('common.retire'), title: translate('common.retireThisMaintenanceSchedule'), onClick: () => setRetire(schedule) },
      ]} title={<>{schedule.itemName} · {schedule.assetCode || t('operations.review.entireItem')}</>} status={schedule.active ? 'active' : 'retired'}>
      <Typography color="text.secondary">{formatStatus(schedule.maintenanceType)}</Typography>
      <Typography>{formatStatus(schedule.intervalType)} · {schedule.intervalValue} · {t('operations.lifecycleOperations.nextDue')}: {schedule.nextDueAt != null ? formatDate(schedule.nextDueAt) : schedule.nextDueValue}</Typography>
      <Typography>{schedule.active ? t('enum.value.active') : t('operations.lifecycleOperations.retired')} · {schedule.checkoutBlocking ? t('operations.lifecycleOperations.blocksCheckoutWhenDue') : t('enum.value.advisory')}</Typography>
      {schedule.requiredChecklist && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{schedule.requiredChecklist}</Typography>}

    </OperationListEntry>)}
    <LoadMore list={schedules} />
    {chooseItem && <OperationForm title={t('operations.lifecycleOperations.scheduleMaintenance')} fields={[{ key: 'itemId', label: t('common.item'), type: 'item', required: true }]} onClose={() => setChooseItem(false)} submitLabel={t('common.next')} onSave={async (values) => setEdit({ itemId: String(values.itemId) })} />}
    {edit && <OperationForm title={t('operations.lifecycleOperations.maintenanceSchedule')} initial={edit.schedule ? Object.fromEntries(Object.entries(edit.schedule).filter(([, value]) => value != null)) as Values : { maintenanceType: 'generator_service', intervalType: 'date', intervalValue: 365, warningWindow: 14, active: true, checkoutBlocking: true }} onClose={() => setEdit(null)} fields={(values) => [
      { key: 'assetInstanceId', label: t('operations.lifecycleOperations.assetEmptyEntireItem'), options: (assets.data ?? []).map((asset) => ({ value: asset.id, label: asset.assetCode })) },
      { key: 'responsiblePersonId', label: t('operations.lifecycleOperations.responsiblePerson'), pagedOptions: { queryKey: ['users', 'assignable'], getPage: personOptions } },
      { key: 'maintenanceType', label: t('operations.lifecycleOperations.maintenanceType'), required: true, options: ['dguv_v3', 'generator_service', 'battery_test', 'chrono_fps'].map((value) => ({ value, label: value })) },
      { key: 'intervalType', label: t('operations.lifecycleOperations.intervalType'), required: true, options: [{ value: 'date', label: t('enum.value.date') }, { value: 'operating_hours', label: t('enum.value.operating_hours') }, { value: 'usage_count', label: t('operations.lifecycleOperations.usageCount') }] },
      { key: 'intervalValue', label: t('operations.lifecycleOperations.interval'), type: 'number', min: values.intervalType === 'date' ? 1 : 0.01, step: values.intervalType === 'date' ? 1 : 0.01, required: true },
      values.intervalType === 'date' ? { key: 'nextDueAt', label: t('operations.lifecycleOperations.dueAt'), type: 'datetime-local', required: true } : { key: 'nextDueValue', label: t('operations.lifecycleOperations.dueMeterReading'), type: 'number', min: 0, step: 0.01, required: true },
      { key: 'warningWindow', label: t('operations.lifecycleOperations.warningWindowIntervalUnits'), type: 'number', min: 0, step: 0.01 },
      { key: 'requiredChecklist', label: t('operations.lifecycleOperations.requiredChecklist'), multiline: true },
      { key: 'checkoutBlocking', label: t('operations.lifecycleOperations.blockCheckoutWhenDue'), type: 'checkbox' }, { key: 'active', label: t('enum.value.active'), type: 'checkbox' },
    ]} onSave={(values) => operationsApi.saveSchedule(scheduleInput({ ...optionalValues(values), itemId: edit.itemId, nextDueAt: values.intervalType === 'date' ? Number(values.nextDueAt) : null, nextDueValue: values.intervalType === 'date' ? null : values.nextDueValue }), edit.schedule?.id)} />}
    {complete && <OperationForm title={t('operations.lifecycleOperations.recordMaintenance')} initial={{ result: 'passed', performedAt }} onClose={() => setComplete(null)} fields={[
      { key: 'performedAt', label: t('operations.lifecycleOperations.performedAt'), type: 'datetime-local', required: true },
      { key: 'result', label: t('operations.lifecycleOperations.result'), required: true, options: [{ value: 'passed', label: t('enum.value.passed') }, { value: 'failed', label: t('operations.lifecycleOperations.failed') }, { value: 'advisory', label: t('operations.lifecycleOperations.advisory') }] },
      { key: 'operatingHours', label: t('enum.value.operating_hours'), type: 'number', min: 0, step: 0.1, required: complete.intervalType === 'operating_hours' },
      { key: 'certificateNumber', label: t('operations.lifecycleOperations.certificateNumber') },
      { key: 'notes', label: t('operations.lifecycleOperations.checklistObservationsAndResults'), required: Boolean(complete.requiredChecklist), multiline: true, help: complete.requiredChecklist },
    ]} onSave={(values) => createMaintenanceRecord({ itemId: complete.itemId, assetInstanceId: complete.assetInstanceId, scheduleId: complete.id, type: complete.maintenanceType, performedAt: Number(values.performedAt), result: oneOf(values.result, MAINTENANCE_RESULTS), operatingHours: values.operatingHours === undefined || values.operatingHours === '' ? undefined : Number(values.operatingHours), certificateNumber: String(values.certificateNumber || ''), notes: String(values.notes || '') })} />}
    {retire && <OperationForm title={t('operations.lifecycleOperations.retireMaintenanceSchedule')} fields={[]} onClose={() => setRetire(null)} onSave={() => operationsApi.retireSchedule(retire.id)}><Alert severity="warning">{t('operations.lifecycleOperations.thisScheduleWillNoLongerBeCheckedAtCheckout')}</Alert></OperationForm>}
  </Stack>;
}

