import { calendarDate, dateFieldValue, formatDate } from '../utils/dateFormat';
import { Button, Tab } from '../components/shared/ActionButtons';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canPerformMaintenance } from '../utils/access';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import { IconButton } from '../components/shared/ActionButtons';
import { Dialog } from '../components/shared/ClosableDialog';
import { PageHeader } from '../components/shared/PageHeader';
import { ActionBar } from '../components/shared/ActionBar';
import { InfoTip } from '../components/shared/InfoTip';
import { useCompactCatalog } from '../hooks/useCompactCatalog';
import { TextField } from '../components/shared/DateTextField';
import BuildIcon from '@mui/icons-material/Build';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryIcon from '@mui/icons-material/History';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useItemAssets, useItemCategories, useItemsByIds, usePagedItems } from '../hooks/useItems';
import { ItemAutocomplete } from '../components/shared/ItemAutocomplete';
import { LoadMore } from '../components/shared/LoadMore';
import { createMaintenanceRecord, getMaintenanceRecords } from '../services/maintenanceService';
import { getCategoryMaintenancePolicies, saveCategoryMaintenancePolicy } from '../services/categoryMaintenanceService';
import { useUIStore } from '../store/uiStore';
import { translate, useT } from '../utils/naming';
import type { Item } from '../types';
import { MAINTENANCE_RESULTS, MAINTENANCE_TYPES, type MaintenanceResult, type MaintenanceType, type Schedule } from '../types/operations';
import { oneOf } from '../utils/operationForm';
import { useCompleteList } from '../hooks/usePagedList';
import { operationsApi } from '../services/operationsService';
import { SchedulesPanel } from '../components/operations/SchedulesPanel';
import { maintenanceTypeLabel } from '../components/maintenance/maintenanceSchedules';
import { formatStatus } from '../utils/formatters';

function dateInputValue(date: Date): number {
  return calendarDate(date);
}

function addMonths(months: number): number {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return dateInputValue(d);
}

function addYears(years: number): number {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return dateInputValue(d);
}

export function Maintenance() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'schedules' ? 'schedules' : 'inspections';
  const { user } = useAuth();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const compact = useCompactCatalog();
  // Recording an inspection and the per-category intervals are dialogs, so the due list leads the page.
  const [formOpen, setFormOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  // Items needing attention come filtered from the server; the inspection picker searches the server.
  const attentionItems = usePagedItems({ maintenanceAttention: true, sort: 'name' });
  const { data: categories = [] } = useItemCategories();
  const { data: categoryPolicies = [] } = useQuery({ queryKey: ['category-maintenance'], queryFn: getCategoryMaintenancePolicies });
  const { data: records = [], isLoading: recordsLoading, error: recordsError } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => getMaintenanceRecords(),
  });

  const [itemId, setItemId] = useState('');
  const [assetId, setAssetId] = useState('');
  const { data: assets = [], isComplete: assetsComplete } = useItemAssets(itemId || undefined);
  const selectedItem = useItemsByIds(itemId ? [itemId] : []).data?.[0];
  const serialized = selectedItem?.trackingMode === 'serialized';
  const [policyCategory, setPolicyCategory] = useState('');
  const [policyInterval, setPolicyInterval] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const schedules = useCompleteList<Schedule>(['operations', `schedules:inspection:${itemId}`], operationsApi.schedules({ itemId }), { enabled: Boolean(itemId) });
  const activeSchedule = schedules.data?.find((schedule) => schedule.id === scheduleId && schedule.active);
  const requiresAsset = serialized && (!activeSchedule || Boolean(activeSchedule.assetInstanceId));
  const policyMutation = useMutation({
    mutationFn: () => saveCategoryMaintenancePolicy(policyCategory, Number(policyInterval) || 0),
    onSuccess: () => {
      showSnackbar(t('pages.maintenance.maintenanceIntervalSaved'), 'success');
    },
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('common.failedToSave'), 'error'),
  });
  const [type, setType] = useState<MaintenanceType>('dguv_v3');
  const [result, setResult] = useState<MaintenanceResult>('passed');
  const [nextDueAt, setNextDueAt] = useState<number | ''>('');
  const [certificateNumber, setCertificateNumber] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: (performedAt: number) =>
      createMaintenanceRecord({
        itemId,
        assetInstanceId: requiresAsset ? activeSchedule?.assetInstanceId || assetId : undefined,
        scheduleId: activeSchedule?.id,
        type: activeSchedule?.maintenanceType ?? type,
        result,
        performedAt,
        nextDueAt: result === 'failed' || nextDueAt === '' ? undefined : nextDueAt,
        certificateNumber: certificateNumber || undefined,
        operatingHours: operatingHours ? Number(operatingHours) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      showSnackbar(t('pages.maintenance.inspectionRecordedSuccessfully'), 'success');
      setFormOpen(false);
      setItemId('');
      setAssetId('');
      setScheduleId('');
      setNotes('');
      setCertificateNumber('');
      setOperatingHours('');
      setNextDueAt('');
    },
    onError: (err) => {
      showSnackbar(err instanceof Error ? err.message : t('common.failedToSave'), 'error');
    },
  });

  const attention = attentionItems.data ?? [];
  const attentionCount = attention.length;

  function scheduleDue(schedule: Schedule) {
    const due = new Date();
    due.setDate(due.getDate() + (Number(schedule.intervalValue) || 0));
    return dateInputValue(due);
  }

  function prefillInspection(item: Item) {
    setItemId(item.id);
    setAssetId('');
    setScheduleId(item.blockingMaintenance.length === 1 ? item.blockingMaintenance[0].scheduleId : '');
    setType('dguv_v3');
    setResult('passed');
    setNotes('');
    setCertificateNumber('');
    setOperatingHours('');
    setNextDueAt('');
    setFormOpen(true);
  }

  return (
    <Box>
      <PageHeader title={t('pages.maintenance.maintenanceInspections')} description={t('pages.maintenance.dGUVV3ServiceIntervalsBatteryTestsAndChronoRecords')}
        inlineActions={compact} actions={<ActionBar iconOnly={compact} actions={[
          { key: 'intervals', label: t('pages.maintenance.maintenanceByCategory'), icon: <TuneIcon />, onClick: () => setPolicyOpen(true) },
          canPerformMaintenance(user) && { key: 'record', label: t('pages.maintenance.recordInspection'), icon: <AddIcon />, variant: 'contained', pinned: true,
            onClick: () => { setItemId(''); setAssetId(''); setScheduleId(''); setResult('passed'); setNotes(''); setCertificateNumber(''); setOperatingHours(''); setNextDueAt(''); setFormOpen(true); } },
        ]} />} />

      <Dialog open={policyOpen} onClose={() => setPolicyOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t('pages.maintenance.maintenanceByCategory')}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select fullWidth label={t('common.category')} value={policyCategory}
              onChange={(event) => {
                const category = event.target.value;
                setPolicyCategory(category);
                setPolicyInterval(String(categoryPolicies.find((policy) => policy.category.toLowerCase() === category.toLowerCase())?.intervalDays
                  ?? 0));
              }}>
              {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
            </TextField>
            <TextField fullWidth type="number" label={t('pages.maintenance.maintenanceIntervalDays')}
              value={policyInterval} onChange={(event) => setPolicyInterval(event.target.value)}
              helperText={t('pages.maintenance.0NoScheduledMaintenance')}
              slotProps={{ htmlInput: { min: 0, step: 1 } }} />
            <Button title={translate('pages.maintenance.saveThisCategorySInspectionInterval')} variant="contained" disabled={!canEditCatalog(user) || !policyCategory || policyMutation.isPending || !/^\d+$/.test(policyInterval)}
              sx={{ flexShrink: 0, alignSelf: { sm: 'flex-start' }, mt: { sm: 1 } }} onClick={() => policyMutation.mutate()}>{t('common.save')}</Button>
          </Stack>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onChange={(_, value: string) => setParams({ tab: value })} sx={{ mb: 2 }}>
        <Tab value="inspections" label={t('operations.review.inspections')} />
        <Tab value="schedules" label={t('pages.operations.schedules')} />
      </Tabs>
      {tab === 'schedules' ? <SchedulesPanel /> : <>
      {attentionItems.error && <Alert severity="error">{attentionItems.error.message}</Alert>}
      {/* Attention / Overdue Section */}
      {!!attentionCount && (
        <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 3, borderLeft: 4, borderColor: 'warning.main' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
            <WarningAmberIcon color="warning" />
            <Typography variant="h6">
              {t('pages.maintenance.dueOverdueInspections')} ({attentionCount}{attentionItems.hasNextPage ? '+' : ''})
            </Typography>
            <InfoTip>{t('pages.maintenance.overdueOrInServiceItemsAreBlockedFromCheckoutUntil')}</InfoTip>
          </Stack>
          <Stack spacing={1}>
            {attention.map((item) => (
              <Card key={item.id} variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
                        <Chip
                          size="small"
                          icon={item.maintenanceStatus === 'overdue' || item.maintenanceStatus === 'out_of_service' ? <ErrorIcon /> : <WarningAmberIcon />}
                          color={item.maintenanceStatus === 'overdue' || item.maintenanceStatus === 'out_of_service' ? 'error' : 'warning'}
                          label={formatStatus(item.maintenanceStatus)}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {item.category ? `${item.category} · ` : ''}
                        {item.expand?.storageLocation?.name || item.storageLocation || t('pages.maintenance.noLocation')}
                        {item.nextMaintenanceDue != null ? ` · ${t('pages.maintenance.dueOn')}: ${formatDate(item.nextMaintenanceDue)}` : ''}
                      </Typography>
                    </Box>
                    <InspectButton phone={phone} title={translate('pages.maintenance.fillInTheInspectionFormForThisItem')}
                      label={t('pages.maintenance.inspectNow')} onClick={() => prefillInspection(item)} />
                  </Stack>
                </CardContent>
              </Card>
            ))}

          </Stack>
          <LoadMore list={attentionItems} />
        </Paper>
      )}
      {!attentionCount && !attentionItems.isLoading && !attentionItems.error && <Alert severity="success" sx={{ mb: 3 }}>{t('pages.maintenance.noMaintenanceDue')}</Alert>}


      {/* Record Inspection Form */}
      <Dialog open={formOpen} onClose={() => { if (!mutation.isPending) setFormOpen(false); }} fullScreen={phone} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 7 }}>
          <BuildIcon color="primary" />{t('pages.maintenance.recordInspection')}
        </DialogTitle>
        <DialogContent dividers>
        <Stack spacing={2}>
          <ItemAutocomplete
            label={t('pages.maintenance.selectItem')}
            required
            getOptionLabel={(item) => `${item.name} (${formatStatus(item.maintenanceStatus)})`}
            value={itemId || null}
            onChange={(item) => {
              setItemId(item?.id || '');
              setAssetId('');
              setScheduleId('');
              setNextDueAt('');
            }}
          />
          <TextField select label={t('operations.review.inspectionSchedule')} value={scheduleId} disabled={!itemId || !schedules.isComplete}
            onChange={(event) => {
              const schedule = schedules.data?.find((entry) => entry.id === event.target.value);
              setScheduleId(schedule?.id ?? '');
              setAssetId(schedule?.assetInstanceId ?? '');
              if (schedule) setType(schedule.maintenanceType);
              setNextDueAt(schedule?.intervalType === 'date' ? scheduleDue(schedule) : '');
            }}>
            <MenuItem value="">{t('operations.review.unscheduledInspection')}</MenuItem>
            {(schedules.data ?? []).filter((schedule) => schedule.active).map((schedule) => <MenuItem key={schedule.id} value={schedule.id}>
              {maintenanceTypeLabel(schedule.maintenanceType)} · {schedule.assetCode || t('operations.review.entireItem')} · {schedule.intervalType === 'date' ? formatDate(schedule.nextDueAt) : schedule.nextDueValue}
            </MenuItem>)}
          </TextField>
          {schedules.error && <Alert severity="error">{schedules.error.message}</Alert>}
          {requiresAsset && <TextField select label={t('common.asset')} value={activeSchedule?.assetInstanceId || assetId} disabled={Boolean(activeSchedule)} onChange={(event) => setAssetId(event.target.value)} required>
            {assets.filter((asset) => asset.active).map((asset) => <MenuItem key={asset.id} value={asset.id}>{asset.assetCode}</MenuItem>)}
          </TextField>}
          {!activeSchedule && <Alert severity="info">{t('operations.review.unscheduledHelp')}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              label={t('common.inspectionType')}
              value={activeSchedule?.maintenanceType ?? type}
              disabled={Boolean(activeSchedule)}
              onChange={(event) => setType(oneOf(event.target.value, MAINTENANCE_TYPES))}
            >
              <MenuItem value="dguv_v3">DGUV V3 ({t('pages.maintenance.electricalEquipment')})</MenuItem>
              <MenuItem value="generator_service">{t('pages.maintenance.generatorServiceMaintenance')}</MenuItem>
              <MenuItem value="battery_test">{t('pages.maintenance.batteryTestBatteryCare')}</MenuItem>
              <MenuItem value="chrono_fps">Chrono / FPS ({t('pages.maintenance.firearmsBlasters')})</MenuItem>
            </TextField>
            <TextField
              select
              fullWidth
              label={t('pages.maintenance.result')}
              value={result}
              onChange={(event) => setResult(oneOf(event.target.value, MAINTENANCE_RESULTS))}
            >
              <MenuItem value="passed">{t('pages.maintenance.passedCertified')}</MenuItem>
              <MenuItem value="advisory">{t('pages.maintenance.advisoryMinorIssue')}</MenuItem>
              <MenuItem value="failed">{t('pages.maintenance.failedLocked')}</MenuItem>
            </TextField>
          </Stack>

          {activeSchedule?.intervalType === 'date' && result !== 'failed' && <Alert severity="info">
            {t('pages.maintenance.thisInspectionAdvancesTheMaintenanceScheduleEveryIntervalValueDays', { intervalValue: String(activeSchedule.intervalValue) })}
            {activeSchedule.requiredChecklist ? ` ${t('pages.maintenance.documentTheRequiredChecklistInTheNotes')} ${activeSchedule.requiredChecklist}` : ''}
          </Alert>}
          {activeSchedule?.intervalType === 'date' && result !== 'failed' && <Box>
            <TextField
              fullWidth
              type="date"
              label={t('common.nextDueDate')}
              value={nextDueAt}
              onChange={(event) => setNextDueAt(dateFieldValue(event.target.value))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>
                {t('pages.maintenance.presets')}:
              </Typography>
              <Button title={translate('pages.maintenance.setTheNextInspectionToOneYearFromToday')} size="small" variant="outlined" onClick={() => setNextDueAt(addYears(1))}>
                +1 {t('pages.maintenance.yearDGUVV3')}
              </Button>
              <Button title={translate('pages.maintenance.setTheNextInspectionToSixMonthsFromToday')} size="small" variant="outlined" onClick={() => setNextDueAt(addMonths(6))}>
                +6 {t('pages.maintenance.months')}
              </Button>
              <Button title={translate('pages.maintenance.setTheNextInspectionToTwoYearsFromToday')} size="small" variant="outlined" onClick={() => setNextDueAt(addYears(2))}>
                +2 {t('pages.maintenance.years')}
              </Button>
            </Stack>
          </Box>}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label={t('pages.maintenance.certificateProtocolNo')}
              placeholder={t('pages.maintenance.eGDGUV2026081')}
              value={certificateNumber}
              onChange={(event) => setCertificateNumber(event.target.value)}
            />
            <TextField
              fullWidth
              type="number"
              required={activeSchedule?.intervalType === 'operating_hours'}
              label={t('enum.value.operating_hours')}
              value={operatingHours}
              onChange={(event) => setOperatingHours(event.target.value)}
            />
          </Stack>

          <TextField
            multiline
            minRows={2}
            label={t('pages.maintenance.notesRemarks')}
            required={Boolean(activeSchedule?.requiredChecklist)}
            placeholder={t('pages.maintenance.eGProtectiveEarthResistance008OhmVisualCheck')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}

          <Button title={translate('pages.maintenance.saveTheInspectionResultAndUpdateTheItemStatus')}
            variant="contained"
            size="large"
            color={result === 'failed' ? 'error' : result === 'advisory' ? 'warning' : 'primary'}
            disabled={!canPerformMaintenance(user) || !selectedItem || !schedules.isComplete || (scheduleId !== '' && !activeSchedule) || (requiresAsset && (!assetsComplete || !assets.some((asset) => asset.active && asset.id === (activeSchedule?.assetInstanceId || assetId)))) || (activeSchedule?.intervalType === 'operating_hours' && !operatingHours) || (Boolean(activeSchedule?.requiredChecklist) && !notes.trim()) || mutation.isPending}
            onClick={() => mutation.mutate(Date.now())}
            sx={{ minHeight: 44 }}
          >
            {result === 'failed'
              ? t('pages.maintenance.saveInspectionLockItem')
              : result === 'advisory'
                ? t('pages.maintenance.saveInspectionWithAdvisory')
                : t('pages.maintenance.saveInspectionCertifyItem')}
          </Button>
        </Stack>
        </DialogContent>
      </Dialog>

      {/* Recent Inspections History */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <HistoryIcon color="primary" />
        <Typography variant="h6">{t('pages.maintenance.recentInspectionsProtocols')}</Typography>
      </Stack>

      {recordsError && <Alert severity="error">{recordsError.message}</Alert>}
      {recordsLoading ? (
        <Typography color="text.secondary">{t('pages.maintenance.loadingInspections')}</Typography>
      ) : !records.length ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">{t('pages.maintenance.noInspectionsRecordedYet')}</Typography>
        </Paper>
      ) : (
        <Stack spacing={1}>
          {records.slice(0, 50).map((record) => {
            return (
              <Card key={record.id} variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700 }}>{record.itemName}</Typography>
                        <Chip size="small" variant="outlined" label={formatStatus(record.type)} />
                        <Chip
                          size="small"
                          icon={record.result === 'passed' ? <CheckCircleIcon /> : <ErrorIcon />}
                          color={record.result === 'passed' ? 'success' : record.result === 'failed' ? 'error' : 'warning'}
                          label={
                            record.result === 'passed'
                              ? t('enum.value.passed')
                              : record.result === 'failed'
                              ? t('pages.maintenance.failed')
                              : t('enum.value.advisory')
                          }
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {t('pages.maintenance.inspectedOn')}: {formatDate(record.performedAt)}
                        {record.nextDueAt != null ? ` · ${t('pages.maintenance.nextDue')}: ${formatDate(record.nextDueAt)}` : ''}
                        {record.certificateNumber ? ` · Nr: ${record.certificateNumber}` : ''}
                        {record.operatingHours ? ` · ${record.operatingHours}h` : ''}
                      </Typography>
                      {record.notes && (
                        <Typography variant="body2" sx={{ mt: 0.5, color: 'text.primary' }}>
                          {record.notes}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
      </>}
    </Box>
  );
}

/** Opens the inspection form for a due entry; an icon on phones so the entry keeps one row. */
function InspectButton({ phone, title, label, onClick }: { phone: boolean; title: string; label: string; onClick: () => void }) {
  if (phone) return <IconButton title={label} color="primary" onClick={onClick} sx={{ flexShrink: 0, border: 1, borderColor: 'divider' }}>
    <ArrowForwardIcon />
  </IconButton>;
  return <Button title={title} size="small" variant="contained" color="primary" endIcon={<ArrowForwardIcon fontSize="small" />}
    onClick={onClick} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
    {label}
  </Button>;
}
