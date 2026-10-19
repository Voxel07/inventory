import { formatDate } from '../utils/dateFormat';
import { Button } from '../components/shared/ActionButtons';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canPerformMaintenance } from '../utils/access';
import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
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
import { useOperationList } from '../hooks/useOperations';
import { operationsApi } from '../services/operationsService';
import { IndividualSchedules } from '../components/maintenance/IndividualSchedules';
import { CALENDAR_WARNING_DAYS, isDateSchedule, matchingSchedule, scheduleIsOverdue, maintenanceTypeLabel } from '../components/maintenance/maintenanceSchedules';
import { formatStatus } from '../utils/formatters';

function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return dateInputValue(d);
}

function addYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return dateInputValue(d);
}

export function Maintenance() {
  const t = useT();
  const { user } = useAuth();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const formRef = useRef<HTMLDivElement | null>(null);

  // Items needing attention come filtered from the server; the inspection picker searches the server.
  const attentionItems = usePagedItems({ maintenanceAttention: true, sort: 'name' });
  const { data: categories = [] } = useItemCategories();
  const { data: categoryPolicies = [] } = useQuery({ queryKey: ['category-maintenance'], queryFn: getCategoryMaintenancePolicies });
  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => getMaintenanceRecords(),
  });

  const [itemId, setItemId] = useState('');
  const [assetId, setAssetId] = useState('');
  const { data: assets = [] } = useItemAssets(itemId || undefined);
  const selectedItem = useItemsByIds(itemId ? [itemId] : []).data?.[0];
  const serialized = selectedItem?.trackingMode === 'serialized';
  const [policyCategory, setPolicyCategory] = useState('');
  const [policyInterval, setPolicyInterval] = useState('');
  const schedules = useOperationList<Schedule>('schedules', operationsApi.schedules());
  const dateSchedules = (schedules.data ?? []).filter(isDateSchedule);
  const policyMutation = useMutation({
    mutationFn: () => saveCategoryMaintenancePolicy(policyCategory, Number(policyInterval) || 0),
    onSuccess: () => {
      showSnackbar(t('pages.maintenance.maintenanceIntervalSaved'), 'success');
    },
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('common.failedToSave'), 'error'),
  });
  const [type, setType] = useState<MaintenanceType>('dguv_v3');
  const [result, setResult] = useState<MaintenanceResult>('passed');
  const [nextDueAt, setNextDueAt] = useState('');
  const [certificateNumber, setCertificateNumber] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createMaintenanceRecord({
        itemId,
        assetInstanceId: serialized ? assetId : undefined,
        scheduleId: matchingSchedule(dateSchedules, itemId, serialized ? assetId : undefined, type)?.id,
        type,
        result,
        performedAt: new Date().toISOString(),
        nextDueAt: nextDueAt ? new Date(`${nextDueAt}T12:00:00Z`).toISOString() : undefined,
        certificateNumber: certificateNumber || undefined,
        operatingHours: operatingHours ? Number(operatingHours) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      showSnackbar(t('pages.maintenance.inspectionRecordedSuccessfully'), 'success');
      setItemId('');
      setNotes('');
      setCertificateNumber('');
      setOperatingHours('');
      setNextDueAt('');
    },
    onError: (err) => {
      showSnackbar(err instanceof Error ? err.message : t('common.failedToSave'), 'error');
    },
  });

  const warningDate = new Date();
  warningDate.setDate(warningDate.getDate() + CALENDAR_WARNING_DAYS);
  const today = dateInputValue(new Date());
  const attention = attentionItems.data ?? [];
  const attentionSchedules = dateSchedules.filter((schedule) => !schedule.nextDueAt || new Date(schedule.nextDueAt) <= warningDate);
  const attentionCount = attention.length + attentionSchedules.length;
  const activeSchedule = itemId ? matchingSchedule(dateSchedules, itemId, serialized ? assetId : undefined, type) : undefined;

  function scheduleDue(schedule: Schedule) {
    const due = new Date();
    due.setDate(due.getDate() + (Number(schedule.intervalValue) || 0));
    return dateInputValue(due);
  }

  function prefillSchedule(schedule: Schedule) {
    setItemId(schedule.itemId);
    setAssetId(schedule.assetInstanceId ?? '');
    setType(schedule.maintenanceType);
    setNextDueAt(scheduleDue(schedule));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function prefillInspection(item: Item) {
    setItemId(item.id);
    const lowerName = item.name.toLowerCase();
    const lowerCat = (item.category || '').toLowerCase();
    if (lowerCat.includes('generator') || lowerName.includes('strom') || lowerName.includes('aggregat')) {
      setType('generator_service');
    } else if (lowerCat.includes('funk') || lowerName.includes('akku') || lowerName.includes('batterie')) {
      setType('battery_test');
    } else if (lowerCat.includes('softair') || lowerName.includes('waffe') || lowerName.includes('markierer')) {
      setType('chrono_fps');
    } else {
      setType('dguv_v3');
    }
    const schedule = dateSchedules.find((candidate) => candidate.itemId === item.id);
    setNextDueAt(schedule ? scheduleDue(schedule) : '');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">{t('pages.maintenance.maintenanceInspections')}</Typography>
        <Typography color="text.secondary">
          {t('pages.maintenance.dGUVV3ServiceIntervalsBatteryTestsAndChronoRecords')}
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('pages.maintenance.maintenanceByCategory')}</Typography>
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
      </Paper>

      <IndividualSchedules schedules={schedules.data ?? []} canEdit={canPerformMaintenance(user)} onInspect={prefillSchedule} />

      {/* Attention / Overdue Section */}
      {!!attentionCount && (
        <Paper sx={{ p: 2, mb: 3, borderLeft: 4, borderColor: 'warning.main' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
            <WarningAmberIcon color="warning" />
            <Typography variant="h6">
              {t('pages.maintenance.dueOverdueInspections')} ({attentionCount}{attentionItems.hasNextPage ? '+' : ''})
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('pages.maintenance.overdueOrInServiceItemsAreBlockedFromCheckoutUntil')}
          </Typography>
          <Stack spacing={1}>
            {attention.map((item) => (
              <Card key={item.id} variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
                        <Chip
                          size="small"
                          icon={item.nextMaintenanceDue && item.nextMaintenanceDue < today ? <ErrorIcon /> : <WarningAmberIcon />}
                          color={item.maintenanceStatus === 'in_service' ? 'info' : item.nextMaintenanceDue && item.nextMaintenanceDue < today ? 'error' : 'warning'}
                          label={
                            item.maintenanceStatus === 'in_service'
                              ? t('pages.maintenance.inService')
                              : item.nextMaintenanceDue && item.nextMaintenanceDue < today
                              ? t('enum.value.overdue')
                              : t('enum.value.due_soon')
                          }
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {item.category ? `${item.category} · ` : ''}
                        {item.expand?.storageLocation?.name || item.storageLocation || t('pages.maintenance.noLocation')}
                        {item.nextMaintenanceDue ? ` · ${t('pages.maintenance.dueOn')}: ${formatDate(item.nextMaintenanceDue)}` : ''}
                      </Typography>
                    </Box>
                    <Button title={translate('pages.maintenance.fillInTheInspectionFormForThisItem')}
                      size="small"
                      variant="contained"
                      color="primary"
                      endIcon={<ArrowForwardIcon fontSize="small" />}
                      onClick={() => prefillInspection(item)}
                      sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      {t('pages.maintenance.inspectNow')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
            {attentionSchedules.map((schedule) => (
              <Card key={schedule.id} variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700 }}>{schedule.itemName}</Typography>
                        {schedule.assetCode && <Chip size="small" variant="outlined" label={schedule.assetCode} />}
                        <Chip size="small" icon={scheduleIsOverdue(schedule) ? <ErrorIcon /> : <WarningAmberIcon />}
                          color={scheduleIsOverdue(schedule) ? 'error' : 'warning'}
                          label={scheduleIsOverdue(schedule) ? t('enum.value.overdue') : t('enum.value.due_soon')} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {maintenanceTypeLabel(schedule.maintenanceType)} · {t('pages.maintenance.dueOn')}: {formatDate(schedule.nextDueAt)}
                      </Typography>
                    </Box>
                    <Button title={translate('pages.maintenance.fillInTheInspectionFormForThisDevice')}
                      size="small" variant="contained" color="primary" endIcon={<ArrowForwardIcon fontSize="small" />}
                      onClick={() => prefillSchedule(schedule)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {t('pages.maintenance.inspectNow')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
          <LoadMore list={attentionItems} />
        </Paper>
      )}
      {!attentionCount && !attentionItems.isLoading && <Alert severity="success" sx={{ mb: 3 }}>{t('pages.maintenance.noMaintenanceDue')}</Alert>}

      {/* Record Inspection Form */}
      <Paper ref={formRef} sx={{ p: 2.5, mb: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
          <BuildIcon color="primary" />
          <Typography variant="h6">{t('pages.maintenance.recordInspection')}</Typography>
        </Stack>
        <Stack spacing={2}>
          <ItemAutocomplete
            label={t('pages.maintenance.selectItem')}
            required
            getOptionLabel={(item) => `${item.name} (${formatStatus(item.maintenanceStatus)})`}
            value={itemId || null}
            onChange={(item) => {
              setItemId(item?.id || '');
              setAssetId('');
              const schedule = item && dateSchedules.find((candidate) => candidate.itemId === item.id);
              if (schedule) {
                setType(schedule.maintenanceType);
                setNextDueAt(scheduleDue(schedule));
              } else setNextDueAt('');
            }}
          />
          {serialized && <TextField select label={t('common.asset')} value={assetId} onChange={(event) => {
            setAssetId(event.target.value);
            const schedule = dateSchedules.find((candidate) => candidate.itemId === itemId && candidate.assetInstanceId === event.target.value);
            if (schedule) { setType(schedule.maintenanceType); setNextDueAt(scheduleDue(schedule)); }
          }} required>
            {assets.map((asset) => <MenuItem key={asset.id} value={asset.id}>{asset.assetCode}</MenuItem>)}
          </TextField>}
          {canPerformMaintenance(user) && <Button title={translate('pages.maintenance.displayMaintenanceSchedulesAndChecklists')} component={Link} to="/operations?tab=schedules">{t('pages.maintenance.openSchedulesAndChecklists')}</Button>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              label={t('common.inspectionType')}
              value={type}
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

          {activeSchedule && <Alert severity="info">
            {t('pages.maintenance.thisInspectionAdvancesTheMaintenanceScheduleEveryIntervalValueDays', { intervalValue: String(activeSchedule.intervalValue) })}
            {activeSchedule.requiredChecklist ? ` ${t('pages.maintenance.documentTheRequiredChecklistInTheNotes')} ${activeSchedule.requiredChecklist}` : ''}
          </Alert>}
          <Box>
            <TextField
              fullWidth
              type="date"
              label={t('common.nextDueDate')}
              value={nextDueAt}
              onChange={(event) => setNextDueAt(event.target.value)}
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
          </Box>

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
              label={t('enum.value.operating_hours')}
              value={operatingHours}
              onChange={(event) => setOperatingHours(event.target.value)}
            />
          </Stack>

          <TextField
            multiline
            minRows={2}
            label={t('pages.maintenance.notesRemarks')}
            placeholder={t('pages.maintenance.eGProtectiveEarthResistance008OhmVisualCheck')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}

          <Button title={translate('pages.maintenance.saveTheInspectionResultAndUpdateTheItemStatus')}
            variant="contained"
            size="large"
            color={result === 'failed' ? 'error' : result === 'advisory' ? 'warning' : 'primary'}
            disabled={!canPerformMaintenance(user) || !itemId || (serialized && !assets.some((asset) => asset.id === assetId)) || mutation.isPending}
            onClick={() => mutation.mutate()}
            sx={{ minHeight: 44 }}
          >
            {result === 'failed'
              ? t('pages.maintenance.saveInspectionLockItem')
              : result === 'advisory'
                ? t('pages.maintenance.saveInspectionWithAdvisory')
                : t('pages.maintenance.saveInspectionCertifyItem')}
          </Button>
        </Stack>
      </Paper>

      {/* Recent Inspections History */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <HistoryIcon color="primary" />
        <Typography variant="h6">{t('pages.maintenance.recentInspectionsProtocols')}</Typography>
      </Stack>

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
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
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
                        {record.nextDueAt ? ` · ${t('pages.maintenance.nextDue')}: ${formatDate(record.nextDueAt)}` : ''}
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
    </Box>
  );
}
