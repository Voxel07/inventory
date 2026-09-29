import { useAssignableUsers } from '../../hooks/useUsers';
import { getVendors } from '../../services/procurementService';
import { createMaintenanceRecord } from '../../services/maintenanceService';
import { useStockLookups } from '../../hooks/useStockLookups';
import { optionalValues } from '../../utils/operationForm';
import { useState } from 'react';
import { Alert, Button, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useItemAssets } from '../../hooks/useItems';
import { useDamageReports } from '../../hooks/useDamageReports';
import { useOperationList } from '../../hooks/useOperations';
import { operationsApi, type Repair, type Schedule } from '../../services/operationsService';
import { OperationForm, type Values } from './OperationForm';
import { useLocalizedText } from '../../utils/naming';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/access';

export function SchedulesPanel() {
  const t = useLocalizedText(); const lookup = useStockLookups();
  const people = useAssignableUsers();
  const schedules = useOperationList('schedules', operationsApi.schedules);
  const [chooseItem, setChooseItem] = useState(false);
  const [edit, setEdit] = useState<{ itemId: string; schedule?: Schedule } | null>(null);
  const assets = useItemAssets(edit?.itemId);
  const [performedAt, setPerformedAt] = useState('');
  const [complete, setComplete] = useState<Schedule | null>(null);
  const [retire, setRetire] = useState<Schedule | null>(null);
  return <Stack spacing={2}>
    <Button variant="contained" onClick={() => setChooseItem(true)}>{t('Wartungsplan anlegen', 'New maintenance schedule')}</Button>
    {schedules.isLoading && <LinearProgress />}{schedules.error && <Alert severity="error">{schedules.error.message}</Alert>}
    {!schedules.isLoading && !schedules.data?.length && <Alert severity="info">{t('Noch keine Wartungspläne.', 'No maintenance schedules yet.')}</Alert>}
    {schedules.data?.map((schedule) => <Card key={schedule.id}><CardContent><Stack spacing={1}>
      <Typography variant="h6">{lookup.items.find((item) => item.id === schedule.itemId)?.name} · {schedule.maintenanceType}</Typography>
      <Typography>{schedule.intervalType} · {schedule.intervalValue} · {t('Nächste Fälligkeit', 'Next due')}: {schedule.nextDueAt ? new Date(schedule.nextDueAt).toLocaleDateString() : schedule.nextDueValue}</Typography>
      <Typography>{schedule.active ? t('Aktiv', 'Active') : t('Stillgelegt', 'Retired')} · {schedule.checkoutBlocking ? t('Sperrt Ausgabe bei Fälligkeit', 'Blocks checkout when due') : t('Hinweis', 'Advisory')}</Typography>
      {schedule.requiredChecklist && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{schedule.requiredChecklist}</Typography>}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={() => setEdit({ itemId: schedule.itemId, schedule })}>{t('Bearbeiten', 'Edit')}</Button>
        <Button component={Link} to={schedule.assetInstanceId ? `/items/${schedule.itemId}/assets/${schedule.assetInstanceId}` : `/items/${schedule.itemId}`}>{t('Gerät / Wartungsnachweis', 'Asset / maintenance records')}</Button>
        {schedule.active && <Button variant="contained" onClick={() => { setPerformedAt(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); setComplete(schedule); }}>{t('Wartung dokumentieren', 'Record maintenance')}</Button>}
        {schedule.active && <Button onClick={() => setRetire(schedule)}>{t('Stilllegen', 'Retire')}</Button>}
      </Stack>
    </Stack></CardContent></Card>)}
    {chooseItem && <OperationForm title={t('Wartung planen', 'Schedule maintenance')} fields={[{ key: 'itemId', label: t('Artikel', 'Item'), options: lookup.itemOptions, required: true }]} onClose={() => setChooseItem(false)} submitLabel={t('Weiter', 'Next')} onSave={async (values) => setEdit({ itemId: String(values.itemId) })} />}
    {edit && <OperationForm title={t('Wartungsplan', 'Maintenance schedule')} initial={edit.schedule ? Object.fromEntries(Object.entries(edit.schedule).filter(([, value]) => value != null).map(([key, value]) => [key, key === 'nextDueAt' ? String(value).slice(0, 16) : value])) as Values : { maintenanceType: 'generator_service', intervalType: 'date', intervalValue: 365, warningWindow: 14, active: true, checkoutBlocking: true }} onClose={() => setEdit(null)} fields={(values) => [
      { key: 'assetInstanceId', label: t('Gerät (leer = gesamter Artikel)', 'Asset (empty = entire item)'), options: (assets.data ?? []).map((asset) => ({ value: asset.id, label: asset.assetCode })) },
      { key: 'responsiblePersonId', label: t('Verantwortlich', 'Responsible person'), options: (people.data ?? []).map((person) => ({ value: person.id, label: person.name || person.email || person.id })) },
      { key: 'maintenanceType', label: t('Prüfung', 'Maintenance type'), required: true, options: ['dguv_v3', 'generator_service', 'battery_test', 'chrono_fps'].map((value) => ({ value, label: value })) },
      { key: 'intervalType', label: t('Intervalltyp', 'Interval type'), required: true, options: [{ value: 'date', label: t('Kalender (Tage)', 'Calendar (days)') }, { value: 'operating_hours', label: t('Betriebsstunden', 'Operating hours') }, { value: 'usage_count', label: t('Nutzungen', 'Usage count') }] },
      { key: 'intervalValue', label: t('Intervall', 'Interval'), type: 'number', min: 0.01, step: 0.01, required: true },
      values.intervalType === 'date' ? { key: 'nextDueAt', label: t('Fällig am', 'Due at'), type: 'datetime-local', required: true } : { key: 'nextDueValue', label: t('Fälliger Zählerstand', 'Due meter reading'), type: 'number', min: 0, step: 0.01, required: true },
      { key: 'warningWindow', label: t('Vorwarnung (Intervall-Einheiten)', 'Warning window (interval units)'), type: 'number', min: 0, step: 0.01 },
      { key: 'requiredChecklist', label: t('Pflichtprüfliste', 'Required checklist'), multiline: true },
      { key: 'checkoutBlocking', label: t('Ausgabe bei Fälligkeit sperren', 'Block checkout when due'), type: 'checkbox' }, { key: 'active', label: t('Aktiv', 'Active'), type: 'checkbox' },
    ]} onSave={(values) => operationsApi.saveSchedule({ ...optionalValues(values), itemId: edit.itemId, nextDueAt: values.intervalType === 'date' ? new Date(String(values.nextDueAt)).toISOString() : null, nextDueValue: values.intervalType === 'date' ? null : values.nextDueValue }, edit.schedule?.id)} />}
    {complete && <OperationForm title={t('Wartung dokumentieren', 'Record maintenance')} initial={{ result: 'passed', performedAt }} onClose={() => setComplete(null)} fields={[
      { key: 'performedAt', label: t('Durchgeführt am', 'Performed at'), type: 'datetime-local', required: true },
      { key: 'result', label: t('Ergebnis', 'Result'), required: true, options: [{ value: 'passed', label: t('Bestanden', 'Passed') }, { value: 'failed', label: t('Nicht bestanden', 'Failed') }, { value: 'advisory', label: t('Mit Hinweis', 'Advisory') }] },
      { key: 'operatingHours', label: t('Betriebsstunden', 'Operating hours'), type: 'number', min: 0, step: 0.1, required: complete.intervalType === 'operating_hours' },
      { key: 'certificateNumber', label: t('Zertifikatsnummer', 'Certificate number') },
      { key: 'notes', label: t('Prüfpunkte und Ergebnisse', 'Checklist observations and results'), required: Boolean(complete.requiredChecklist), multiline: true, help: complete.requiredChecklist },
    ]} onSave={(values) => createMaintenanceRecord({ itemId: complete.itemId, assetInstanceId: complete.assetInstanceId, scheduleId: complete.id, type: complete.maintenanceType as 'dguv_v3', performedAt: new Date(String(values.performedAt)).toISOString(), result: values.result as 'passed' | 'failed' | 'advisory', operatingHours: values.operatingHours === undefined || values.operatingHours === '' ? undefined : Number(values.operatingHours), certificateNumber: String(values.certificateNumber || ''), notes: String(values.notes || '') })} />}
    {retire && <OperationForm title={t('Wartungsplan stilllegen', 'Retire maintenance schedule')} fields={[]} onClose={() => setRetire(null)} onSave={() => operationsApi.retireSchedule(retire.id)}><Alert severity="warning">{t('Dieser Plan wird nicht mehr für die Ausgabe geprüft.', 'This schedule will no longer be checked at checkout.')}</Alert></OperationForm>}
  </Stack>;
}

const repairNext: Record<string, string> = { reported: 'triaged', triaged: 'awaiting_repair', awaiting_repair: 'in_repair', in_repair: 'repaired', repaired: 'verified', verified: 'returned_to_service' };
export function RepairsPanel() {
  const t = useLocalizedText(); const { user } = useAuth(); const lookup = useStockLookups();
  const people = useAssignableUsers();
  const vendors = useOperationList('repair-vendors', getVendors);
  const repairs = useOperationList('repairs', operationsApi.repairs); const damage = useDamageReports();
  const [create, setCreate] = useState(false);
  const [action, setAction] = useState<{ repair: Repair; status: string; key: string } | null>(null);
  const labels: Record<string, string> = { triaged: t('Sichten', 'Triage'), awaiting_repair: t('Zur Reparatur', 'Queue repair'), in_repair: t('Reparatur starten', 'Start repair'), repaired: t('Reparatur abschließen', 'Complete repair'), verified: t('Prüfung bestätigen', 'Verify'), returned_to_service: t('Freigeben', 'Return to service'), written_off: t('Abschreiben', 'Write off') };
  return <Stack spacing={2}>
    <Button variant="contained" onClick={() => setCreate(true)}>{t('Reparatur anlegen', 'New repair case')}</Button>
    {repairs.isLoading && <LinearProgress />}{(repairs.error || damage.error) && <Alert severity="error">{(repairs.error || damage.error)?.message}</Alert>}
    {!repairs.isLoading && !repairs.data?.length && <Alert severity="info">{t('Noch keine Reparaturen.', 'No repair cases yet.')}</Alert>}
    {repairs.data?.map((repair) => {
      const report = damage.data?.find((value) => value.id === repair.damageReportId);
      return <Card key={repair.id}><CardContent><Stack spacing={1}>
        <Typography variant="h6">{lookup.items.find((item) => item.id === report?.itemId)?.name ?? report?.assemblyName} {report?.assetCode} · {repair.status}</Typography>
        <Typography>{report?.description}</Typography><Typography>{repair.partsAndCostNotes}</Typography><Typography>{repair.notes}</Typography>
        {repair.safetyImpact && <Alert severity="warning">{t('Sicherheitsrelevanter Schaden', 'Safety-impacting damage')}</Alert>}
        {repair.verificationResult && <Typography>{t('Prüfergebnis', 'Verification')}: {repair.verificationResult}</Typography>}
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {repairNext[repair.status] && <Button onClick={() => setAction({ repair, status: repairNext[repair.status], key: crypto.randomUUID() })}>{labels[repairNext[repair.status]]}</Button>}
          {canManageUsers(user) && ['reported', 'triaged', 'awaiting_repair', 'in_repair'].includes(repair.status) && <Button color="error" onClick={() => setAction({ repair, status: 'written_off', key: crypto.randomUUID() })}>{labels.written_off}</Button>}
        </Stack>
      </Stack></CardContent></Card>;
    })}
    {create && <OperationForm title={t('Reparatur anlegen', 'New repair case')} fields={[
      { key: 'damageReportId', label: t('Schadensmeldung', 'Damage report'), required: true, options: (damage.data ?? []).filter((report) => !['resolved', 'written_off'].includes(report.status)).map((report) => ({ value: report.id, label: `${lookup.items.find((item) => item.id === report.itemId)?.name ?? report.assemblyName ?? ''} ${report.assetCode ?? ''} · ${report.description}` })) },
      { key: 'repairOwnerId', label: t('Verantwortlich', 'Repair owner'), options: (people.data ?? []).map((person) => ({ value: person.id, label: person.name || person.email || person.id })) },
      { key: 'vendorId', label: t('Reparaturfirma', 'Repair vendor'), options: (vendors.data ?? []).map((vendor) => ({ value: vendor.id, label: vendor.name })) },
      { key: 'partsAndCostNotes', label: t('Teile und Kosten', 'Parts and cost notes'), multiline: true }, { key: 'notes', label: t('Notiz', 'Notes'), multiline: true },
    ]} onSave={(values) => operationsApi.createRepair(optionalValues(values))} onClose={() => setCreate(false)} />}
    {action && <OperationForm title={labels[action.status]} onClose={() => setAction(null)} initial={action.repair.assetInstanceId ? { amount: 1 } : {}} fields={[
      ...(['repaired', 'written_off'].includes(action.status) ? [{ key: 'amount', label: t('Menge', 'Quantity'), type: 'number' as const, min: 1, max: action.repair.assetInstanceId ? 1 : undefined, required: true }] : []),
      ...(action.status === 'verified' ? [{ key: 'verificationResult', label: t('Prüfergebnis', 'Verification result'), required: true, multiline: true }] : []),
      { key: 'repairOwnerId', label: t('Verantwortlich', 'Repair owner'), options: (people.data ?? []).map((person) => ({ value: person.id, label: person.name || person.email || person.id })) },
      { key: 'vendorId', label: t('Reparaturfirma', 'Repair vendor'), options: (vendors.data ?? []).map((vendor) => ({ value: vendor.id, label: vendor.name })) },
      { key: 'notes', label: t('Durchgeführte Arbeit / Begründung', 'Work performed / reason'), required: true, multiline: true },
    ]} onSave={(values) => operationsApi.repairCommand(action.repair.id, { ...optionalValues(values), status: action.status, idempotencyKey: action.key })} />}
  </Stack>;
}

