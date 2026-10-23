import { formatStatus } from '../../utils/formatters';
import { formatDate } from '../../utils/dateFormat';
import { OperationDetail, OperationHistory, OperationListEntry } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { scheduleInput, repairInput, repairTransitionInput } from '../../services/operationsInputs';
import { QueryFeedback } from '../common/QueryFeedback';
import { personOptions, vendorOptions, damageOptions } from '../../services/assignmentOptions';
import { createMaintenanceRecord } from '../../services/maintenanceService';
import { LoadMore } from '../shared/LoadMore';
import { oneOf, optionalValues } from '../../utils/operationForm';
import { useState } from 'react';
import { Alert, Stack, Typography } from '@mui/material';
import { useItemAssets } from '../../hooks/useItems';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import { MAINTENANCE_RESULTS, type Repair, type Schedule } from '../../types/operations';
import { OperationForm } from './OperationForm';
import type { Values } from '../../types/operationForm';
import { translate, useT } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';

export function SchedulesPanel() {
  const t = useT();
  const schedules = useOperationList('schedules', operationsApi.schedules());
  const [chooseItem, setChooseItem] = useState(false);
  const [edit, setEdit] = useState<{ itemId: string; schedule?: Schedule } | null>(null);
  const assets = useItemAssets(edit?.itemId);
  const [performedAt, setPerformedAt] = useState<number | ''>('');
  const [complete, setComplete] = useState<Schedule | null>(null);
  const [retire, setRetire] = useState<Schedule | null>(null);
  return <Stack spacing={2}>
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
      ]} title={schedule.itemName} status={schedule.active ? t('enum.value.active') : t('operations.lifecycleOperations.retired')}>
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
      { key: 'intervalValue', label: t('operations.lifecycleOperations.interval'), type: 'number', min: 0.01, step: 0.01, required: true },
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

const repairNext: Record<string, string> = { reported: 'triaged', triaged: 'awaiting_repair', awaiting_repair: 'in_repair', in_repair: 'repaired', repaired: 'verified', verified: 'returned_to_service' };
export function RepairsPanel() {
  const t = useT(); const { user } = useAuth();
  const repairs = useOperationList('repairs', operationsApi.repairs);
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{ repair: Repair; status: string; key: string } | null>(null);
  const closed = (repair: Repair) => ['returned_to_service', 'written_off'].includes(repair.status);
  const openRepairs = (repairs.data ?? []).filter((repair) => !closed(repair));
  const closedRepairs = (repairs.data ?? []).filter(closed);
  const repairEntry = (repair: Repair) => {
    return <OperationListEntry key={repair.id} actions={closed(repair) ? undefined : [
        !!repairNext[repair.status] && { key: 'next', label: labels[repairNext[repair.status]], title: translate('operations.lifecycleOperations.moveThisRepairCaseToItsNextStatus'),
          pinned: true, onClick: () => setAction({ repair, status: repairNext[repair.status], key: crypto.randomUUID() }) },
        canManageUsers(user) && ['reported', 'triaged', 'awaiting_repair', 'in_repair'].includes(repair.status) && { key: 'write-off', label: labels.written_off,
          title: translate('operations.lifecycleOperations.recordAWriteOffForThisRepairCase'), color: 'error', onClick: () => setAction({ repair, status: 'written_off', key: crypto.randomUUID() }) },
      ]} title={<>{repair.itemName ?? repair.assemblyName} {repair.assetCode}</>} status={repair.status}>
      <OperationDetail label={t('common.damage')}>{repair.damageDescription}</OperationDetail>
      <OperationDetail label={t('operations.lifecycleOperations.partsAndCosts')}>{repair.partsAndCostNotes}</OperationDetail>
      <OperationDetail label={t('common.notes2')}>{repair.notes}</OperationDetail>
      <OperationDetail label={t('operations.lifecycleOperations.verification')}>{repair.verificationResult}</OperationDetail>
      {repair.safetyImpact && <Alert severity="warning">{t('operations.lifecycleOperations.safetyImpactingDamage')}</Alert>}
    </OperationListEntry>;
  };
  const labels: Record<string, string> = { triaged: t('operations.lifecycleOperations.triage'), awaiting_repair: t('operations.lifecycleOperations.queueRepair'), in_repair: t('operations.lifecycleOperations.startRepair'), repaired: t('operations.lifecycleOperations.completeRepair'), verified: t('operations.lifecycleOperations.verify'), returned_to_service: t('operations.lifecycleOperations.returnToService'), written_off: t('common.writeOff') };
  return <Stack spacing={2}>
    <Button title={translate('operations.lifecycleOperations.createANewRepairCase')} variant="contained" onClick={() => setCreate(true)}>{t('operations.lifecycleOperations.newRepairCase')}</Button>
    <QueryFeedback isLoading={repairs.isLoading} error={repairs.error} isEmpty={!repairs.data?.length} emptyMessage={t('operations.lifecycleOperations.noRepairCasesYet')} />
    {openRepairs.length > 0 && <Typography variant="h6" component="h2">{t('operations.lifecycleOperations.openRepairs')} ({openRepairs.length})</Typography>}
    {openRepairs.map(repairEntry)}
    <OperationHistory title={t('operations.lifecycleOperations.repairHistory')} count={closedRepairs.length}>{closedRepairs.map(repairEntry)}</OperationHistory>
    <LoadMore list={repairs} />
    {create && <OperationForm title={t('operations.lifecycleOperations.newRepairCase')} fields={[
      { key: 'damageReportId', label: t('common.damageReport'), required: true, pagedOptions: { queryKey: ['damageReports'], getPage: damageOptions } },
      { key: 'repairOwnerId', label: t('operations.lifecycleOperations.repairOwner'), pagedOptions: { queryKey: ['users', 'assignable'], getPage: personOptions } },
      { key: 'vendorId', label: t('operations.lifecycleOperations.repairVendor'), pagedOptions: { queryKey: ['operations', 'vendors'], getPage: vendorOptions } },
      { key: 'partsAndCostNotes', label: t('operations.lifecycleOperations.partsAndCostNotes'), multiline: true }, { key: 'notes', label: t('common.notes2'), multiline: true },
    ]} onSave={(values) => operationsApi.createRepair(repairInput(optionalValues(values)))} onClose={() => setCreate(false)} />}
    {action && <OperationForm title={labels[action.status]} onClose={() => setAction(null)} initial={action.repair.assetInstanceId ? { amount: 1 } : {}} fields={[
      ...(['repaired', 'written_off'].includes(action.status) ? [{ key: 'amount', label: t('common.quantity'), type: 'number' as const, min: 1, max: action.repair.assetInstanceId ? 1 : undefined, required: true }] : []),
      ...(action.status === 'verified' ? [{ key: 'verificationResult', label: t('operations.lifecycleOperations.verificationResult'), required: true, multiline: true }] : []),
      { key: 'repairOwnerId', label: t('operations.lifecycleOperations.repairOwner'), pagedOptions: { queryKey: ['users', 'assignable'], getPage: personOptions } },
      { key: 'vendorId', label: t('operations.lifecycleOperations.repairVendor'), pagedOptions: { queryKey: ['operations', 'vendors'], getPage: vendorOptions } },
      { key: 'notes', label: t('operations.lifecycleOperations.workPerformedReason'), required: true, multiline: true },
    ]} onSave={(values) => operationsApi.repairCommand(action.repair.id,repairTransitionInput({ ...optionalValues(values), status: action.status, idempotencyKey: action.key }))} />}
  </Stack>;
}
