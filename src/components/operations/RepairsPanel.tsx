import { useState } from 'react';
import { Chip, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { OperationDetail, OperationListEntry, OperationMore } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { OperationForm } from './OperationForm';
import { TaskToolbar } from './TaskToolbar';
import { QueryFeedback } from '../common/QueryFeedback';
import { LoadMore } from '../shared/LoadMore';
import { personOptions, vendorOptions, damageOptions } from '../../services/assignmentOptions';
import { repairInput, repairTransitionInput } from '../../services/operationsInputs';
import { optionalValues } from '../../utils/operationForm';
import { useOperationList } from '../../hooks/useOperations';
import { taskStatusFilter, useTaskFilters } from '../../hooks/useWarehouseTasks';
import { operationsApi } from '../../services/operationsService';
import type { Repair } from '../../types/operations';
import { translate, useT } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';

const repairNext: Record<string, string> = { reported: 'triaged', triaged: 'awaiting_repair', awaiting_repair: 'in_repair', in_repair: 'repaired', repaired: 'verified', verified: 'returned_to_service' };
const repairStatuses = ['reported', 'triaged', 'awaiting_repair', 'in_repair', 'repaired', 'verified', 'returned_to_service', 'written_off'];
const closed = (repair: Repair) => ['returned_to_service', 'written_off'].includes(repair.status);

export function RepairsPanel() {
  const t = useT(); const { user } = useAuth();
  const filters = useTaskFilters('repairs', { status: 'open' });
  const repairs = useOperationList(`repairs:${JSON.stringify(filters.query)}`, operationsApi.repairs(filters.query), { size: 25 });
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{ repair: Repair; status: string; key: string } | null>(null);
  const labels: Record<string, string> = { triaged: t('operations.lifecycleOperations.triage'), awaiting_repair: t('operations.lifecycleOperations.queueRepair'), in_repair: t('operations.lifecycleOperations.startRepair'), repaired: t('operations.lifecycleOperations.completeRepair'), verified: t('operations.lifecycleOperations.verify'), returned_to_service: t('operations.lifecycleOperations.returnToService'), written_off: t('common.writeOff') };
  const facts = (repair: Repair) => [
    t('operations.review.repairUnresolved', { count: repair.unresolvedQuantity }),
    repair.repairedPendingQuantity > 0 && t('operations.review.repairAwaitingVerification', { count: repair.repairedPendingQuantity }),
    repair.repairOwnerName, repair.vendorName,
  ].filter(Boolean).join(' · ');
  return <>
    <TaskToolbar state={filters} searchLabel={t('operations.tasks.repairSearch')} count={repairs.data?.length} more={repairs.hasNextPage} loading={repairs.isFetching}
      action={<Button title={translate('operations.lifecycleOperations.createANewRepairCase')} variant="contained" onClick={() => setCreate(true)}>{t('operations.lifecycleOperations.newRepairCase')}</Button>}
      filters={[taskStatusFilter(t, repairStatuses)]} />
    <QueryFeedback isLoading={repairs.isLoading} error={repairs.error} isEmpty={!repairs.data?.length}
      emptyMessage={filters.changed ? t('operations.tasks.noMatches') : t('operations.lifecycleOperations.noRepairCasesYet')} />
    {repairs.data?.map(repair => <OperationListEntry key={repair.id} status={repair.status}
      title={<>{repair.itemName ?? repair.assemblyName}{repair.assetCode && <Typography component="span" color="text.secondary"> · {repair.assetCode}</Typography>}</>}
      badges={repair.safetyImpact && <Chip size="small" color="warning" icon={<WarningAmberIcon />} label={t('operations.lifecycleOperations.safetyImpact')}
        title={t('operations.lifecycleOperations.safetyImpactingDamage')} />}
      actions={closed(repair) ? undefined : [
        !!repairNext[repair.status] && { key: 'next', label: labels[repairNext[repair.status]], title: translate('operations.lifecycleOperations.moveThisRepairCaseToItsNextStatus'),
          pinned: true, onClick: () => setAction({ repair, status: repairNext[repair.status], key: crypto.randomUUID() }) },
        canManageUsers(user) && ['reported', 'triaged', 'awaiting_repair', 'in_repair'].includes(repair.status) && { key: 'write-off', label: labels.written_off,
          title: translate('operations.lifecycleOperations.recordAWriteOffForThisRepairCase'), color: 'error', onClick: () => setAction({ repair, status: 'written_off', key: crypto.randomUUID() }) },
      ]}>
      <Typography sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={repair.damageDescription}>{repair.damageDescription}</Typography>
      <Typography variant="body2" color="text.secondary">{facts(repair)}</Typography>
      {(repair.partsAndCostNotes || repair.notes || repair.verificationResult) && <OperationMore label={t('common.details')}>
        <OperationDetail label={t('operations.lifecycleOperations.partsAndCosts')}>{repair.partsAndCostNotes}</OperationDetail>
        <OperationDetail label={t('operations.lifecycleOperations.verification')}>{repair.verificationResult}</OperationDetail>
        <OperationDetail label={t('operations.lifecycleOperations.workLog')}>{repair.notes}</OperationDetail>
      </OperationMore>}
    </OperationListEntry>)}
    <LoadMore list={repairs} />
    {create && <OperationForm title={t('operations.lifecycleOperations.newRepairCase')} fields={[
      { key: 'damageReportId', label: t('common.damageReport'), required: true, pagedOptions: { queryKey: ['damageReports'], getPage: damageOptions } },
      { key: 'repairOwnerId', label: t('operations.lifecycleOperations.repairOwner'), pagedOptions: { queryKey: ['users', 'assignable'], getPage: personOptions } },
      { key: 'vendorId', label: t('operations.lifecycleOperations.repairVendor'), pagedOptions: { queryKey: ['operations', 'vendors'], getPage: vendorOptions } },
      { key: 'partsAndCostNotes', label: t('operations.lifecycleOperations.partsAndCostNotes'), multiline: true }, { key: 'notes', label: t('common.notes2'), multiline: true },
    ]} onSave={(values) => operationsApi.createRepair(repairInput(optionalValues(values)))} onClose={() => setCreate(false)} />}
    {action && <OperationForm title={labels[action.status]} onClose={() => setAction(null)} initial={{ amount: action.repair.assetInstanceId ? 1 : action.repair.unresolvedQuantity }} fields={[
      ...(['repaired', 'written_off'].includes(action.status) ? [{ key: 'amount', label: t('common.quantity'), type: 'number' as const, min: 1, max: action.repair.unresolvedQuantity, required: true }] : []),
      ...(action.status === 'verified' ? [{ key: 'verificationResult', label: t('operations.lifecycleOperations.verificationResult'), required: true, multiline: true }] : []),
      { key: 'repairOwnerId', label: t('operations.lifecycleOperations.repairOwner'), pagedOptions: { queryKey: ['users', 'assignable'], getPage: personOptions } },
      { key: 'vendorId', label: t('operations.lifecycleOperations.repairVendor'), pagedOptions: { queryKey: ['operations', 'vendors'], getPage: vendorOptions } },
      { key: 'notes', label: t('operations.lifecycleOperations.workPerformedReason'), required: true, multiline: true },
    ]} onSave={(values) => operationsApi.repairCommand(action.repair.id, repairTransitionInput({ ...optionalValues(values), status: action.status, idempotencyKey: action.key }))} />}
  </>;
}
