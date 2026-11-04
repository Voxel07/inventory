import { useState } from 'react';
import { Alert, Stack, Typography } from '@mui/material';
import { OperationDetail, OperationHistory, OperationListEntry } from './OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { OperationForm } from './OperationForm';
import { QueryFeedback } from '../common/QueryFeedback';
import { LoadMore } from '../shared/LoadMore';
import { personOptions, vendorOptions, damageOptions } from '../../services/assignmentOptions';
import { repairInput, repairTransitionInput } from '../../services/operationsInputs';
import { optionalValues } from '../../utils/operationForm';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi } from '../../services/operationsService';
import type { Repair } from '../../types/operations';
import { translate, useT } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';

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
      <Typography variant="body2">{t('operations.review.repairQuantities', { remaining: repair.unresolvedQuantity, pending: repair.repairedPendingQuantity })}</Typography>
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
    {action && <OperationForm title={labels[action.status]} onClose={() => setAction(null)} initial={{ amount: action.repair.assetInstanceId ? 1 : action.repair.unresolvedQuantity }} fields={[
      ...(['repaired', 'written_off'].includes(action.status) ? [{ key: 'amount', label: t('common.quantity'), type: 'number' as const, min: 1, max: action.repair.unresolvedQuantity, required: true }] : []),
      ...(action.status === 'verified' ? [{ key: 'verificationResult', label: t('operations.lifecycleOperations.verificationResult'), required: true, multiline: true }] : []),
      { key: 'repairOwnerId', label: t('operations.lifecycleOperations.repairOwner'), pagedOptions: { queryKey: ['users', 'assignable'], getPage: personOptions } },
      { key: 'vendorId', label: t('operations.lifecycleOperations.repairVendor'), pagedOptions: { queryKey: ['operations', 'vendors'], getPage: vendorOptions } },
      { key: 'notes', label: t('operations.lifecycleOperations.workPerformedReason'), required: true, multiline: true },
    ]} onSave={(values) => operationsApi.repairCommand(action.repair.id,repairTransitionInput({ ...optionalValues(values), status: action.status, idempotencyKey: action.key }))} />}
  </Stack>;
}
