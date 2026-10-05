import { formatDate } from '../utils/dateFormat';
import { Button } from '../components/shared/ActionButtons';
import { useAuth } from '../hooks/useAuth';
import { canEditCatalog, canPerformMaintenance } from '../utils/access';
import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Box,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HistoryIcon from '@mui/icons-material/History';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useItems, useItemAssets } from '../hooks/useItems';
import { createMaintenanceRecord, getMaintenanceRecords } from '../services/maintenanceService';
import { getCategoryMaintenancePolicies, saveCategoryMaintenancePolicy } from '../services/categoryMaintenanceService';
import { useUIStore } from '../store/uiStore';
import { translate, useLocalizedText } from '../utils/naming';
import type { Item } from '../types';
import type { Schedule } from '../types/operations';
import { useOperationList } from '../hooks/useOperations';
import { operationsApi } from '../services/operationsService';
import { IndividualSchedules, isDateSchedule, matchingSchedule, scheduleIsOverdue, maintenanceTypeLabel, type MaintenanceType } from '../components/maintenance/IndividualSchedules';

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
  const t = useLocalizedText();
  const { user } = useAuth();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const formRef = useRef<HTMLDivElement | null>(null);

  const { data: items = [] } = useItems();
  const { data: categoryPolicies = [] } = useQuery({ queryKey: ['category-maintenance'], queryFn: getCategoryMaintenancePolicies });
  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => getMaintenanceRecords(),
  });

  const [itemId, setItemId] = useState('');
  const [assetId, setAssetId] = useState('');
  const { data: assets = [] } = useItemAssets(itemId || undefined);
  const serialized = items.find((item) => item.id === itemId)?.trackingMode === 'serialized';
  const [policyCategory, setPolicyCategory] = useState('');
  const [policyInterval, setPolicyInterval] = useState('');
  const categories = [...new Set(items.map((item) => item.category).filter(Boolean))].sort();
  const schedules = useOperationList<Schedule>('schedules', operationsApi.schedules);
  const dateSchedules = (schedules.data ?? []).filter(isDateSchedule);
  const scheduledItemIds = new Set(dateSchedules.map((schedule) => schedule.itemId));
  const maintenanceItems = items.filter((item) => (item.maintenanceIntervalDays ?? 0) > 0 || scheduledItemIds.has(item.id));
  const maintenanceItemIds = new Set(maintenanceItems.map((item) => item.id));
  const policyMutation = useMutation({
    mutationFn: () => saveCategoryMaintenancePolicy(policyCategory, Number(policyInterval) || 0),
    onSuccess: () => {
      showSnackbar(t('Wartungsintervall gespeichert', 'Maintenance interval saved'), 'success');
    },
    onError: (err) => showSnackbar(err instanceof Error ? err.message : t('Fehler beim Speichern', 'Failed to save'), 'error'),
  });
  const [type, setType] = useState<MaintenanceType>('dguv_v3');
  const [result, setResult] = useState<'passed' | 'failed' | 'advisory'>('passed');
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
      showSnackbar(t('Prüfung erfolgreich erfasst', 'Inspection recorded successfully'), 'success');
      setItemId('');
      setNotes('');
      setCertificateNumber('');
      setOperatingHours('');
      setNextDueAt('');
    },
    onError: (err) => {
      showSnackbar(err instanceof Error ? err.message : t('Fehler beim Speichern', 'Failed to save'), 'error');
    },
  });

  const warningDate = new Date();
  warningDate.setDate(warningDate.getDate() + 30);
  const today = dateInputValue(new Date());
  const attention = maintenanceItems.filter((item) => (item.maintenanceIntervalDays ?? 0) > 0 && (item.maintenanceStatus === 'in_service'
    || !item.nextMaintenanceDue || item.nextMaintenanceDue <= dateInputValue(warningDate)));
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
    setType(schedule.maintenanceType as MaintenanceType);
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
    const due = new Date();
    due.setDate(due.getDate() + (item.maintenanceIntervalDays || 365));
    setNextDueAt(dateInputValue(due));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">{t('Wartung & Prüfungen', 'Maintenance & inspections')}</Typography>
        <Typography color="text.secondary">
          {t('DGUV V3, Serviceintervalle, Batterietests und Chrono-Protokolle.', 'DGUV V3, service intervals, battery tests, and chrono records.')}
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{t('Wartung nach Kategorie', 'Maintenance by category')}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField select fullWidth label={t('Kategorie', 'Category')} value={policyCategory}
            onChange={(event) => {
              const category = event.target.value;
              setPolicyCategory(category);
              setPolicyInterval(String(categoryPolicies.find((policy) => policy.category.toLowerCase() === category.toLowerCase())?.intervalDays
                ?? items.find((item) => item.category.toLowerCase() === category.toLowerCase() && (item.maintenanceIntervalDays ?? 0) > 0)?.maintenanceIntervalDays ?? 0));
            }}>
            {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
          </TextField>
          <TextField fullWidth type="number" label={t('Wartungsintervall (Tage)', 'Maintenance interval (days)')}
            value={policyInterval} onChange={(event) => setPolicyInterval(event.target.value)}
            helperText={t('0 = keine regelmäßige Wartung', '0 = no scheduled maintenance')}
            slotProps={{ htmlInput: { min: 0, step: 1 } }} />
          <Button title={translate('Das Prüfintervall für diese Kategorie speichern', 'Save this category\'s inspection interval')} variant="contained" disabled={!canEditCatalog(user) || !policyCategory || policyMutation.isPending || !/^\d+$/.test(policyInterval)}
            onClick={() => policyMutation.mutate()}>{t('Speichern', 'Save')}</Button>
        </Stack>
      </Paper>

      <IndividualSchedules items={items} schedules={schedules.data ?? []} canEdit={canPerformMaintenance(user)} onInspect={prefillSchedule} />

      {/* Attention / Overdue Section */}
      {!!attentionCount && (
        <Paper sx={{ p: 2, mb: 3, borderLeft: 4, borderColor: 'warning.main' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
            <WarningAmberIcon color="warning" />
            <Typography variant="h6">
              {t('Fällige & überfällige Prüfungen', 'Due & overdue inspections')} ({attentionCount})
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t(
              'Überfällige oder im Service befindliche Artikel sind für die Ausgabe gesperrt, bis eine bestandene Prüfung hinterlegt wird.',
              'Overdue or in-service items are blocked from checkout until a passed inspection is recorded.'
            )}
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
                              ? t('Im Service', 'In service')
                              : item.nextMaintenanceDue && item.nextMaintenanceDue < today
                              ? t('Überfällig', 'Overdue')
                              : t('Bald fällig', 'Due soon')
                          }
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {item.category ? `${item.category} · ` : ''}
                        {item.expand?.storageLocation?.name || item.storageLocation || t('Kein Lagerort', 'No location')}
                        {item.nextMaintenanceDue ? ` · ${t('Fällig am', 'Due on')}: ${formatDate(item.nextMaintenanceDue)}` : ''}
                      </Typography>
                    </Box>
                    <Button title={translate('Das Prüfformular für diesen Artikel ausfüllen', 'Fill in the inspection form for this item')}
                      size="small"
                      variant="contained"
                      color="primary"
                      endIcon={<ArrowForwardIcon fontSize="small" />}
                      onClick={() => prefillInspection(item)}
                      sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      {t('Jetzt prüfen', 'Inspect now')}
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
                        <Typography sx={{ fontWeight: 700 }}>{items.find((item) => item.id === schedule.itemId)?.name ?? schedule.itemId}</Typography>
                        {schedule.assetCode && <Chip size="small" variant="outlined" label={schedule.assetCode} />}
                        <Chip size="small" icon={scheduleIsOverdue(schedule) ? <ErrorIcon /> : <WarningAmberIcon />}
                          color={scheduleIsOverdue(schedule) ? 'error' : 'warning'}
                          label={scheduleIsOverdue(schedule) ? t('Überfällig', 'Overdue') : t('Bald fällig', 'Due soon')} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {maintenanceTypeLabel(schedule.maintenanceType)} · {t('Fällig am', 'Due on')}: {formatDate(schedule.nextDueAt)}
                      </Typography>
                    </Box>
                    <Button title={translate('Das Prüfformular für dieses Gerät ausfüllen', 'Fill in the inspection form for this device')}
                      size="small" variant="contained" color="primary" endIcon={<ArrowForwardIcon fontSize="small" />}
                      onClick={() => prefillSchedule(schedule)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {t('Jetzt prüfen', 'Inspect now')}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Paper>
      )}
      {!attentionCount && <Alert severity="success" sx={{ mb: 3 }}>{t('Keine Wartung fällig.', 'No maintenance due.')}</Alert>}

      {/* Record Inspection Form */}
      <Paper ref={formRef} sx={{ p: 2.5, mb: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
          <BuildIcon color="primary" />
          <Typography variant="h6">{t('Prüfung erfassen', 'Record inspection')}</Typography>
        </Stack>
        <Stack spacing={2}>
          <Autocomplete
            options={maintenanceItems}
            getOptionLabel={(item) => `${item.name} (${item.maintenanceStatus || 'certified'})`}
            value={maintenanceItems.find((item) => item.id === itemId) || null}
            onChange={(_, item) => {
              setItemId(item?.id || '');
              setAssetId('');
              const schedule = item && dateSchedules.find((candidate) => candidate.itemId === item.id);
              if (schedule) {
                setType(schedule.maintenanceType as MaintenanceType);
                setNextDueAt(scheduleDue(schedule));
              } else if (item?.maintenanceIntervalDays) {
                const due = new Date();
                due.setDate(due.getDate() + item.maintenanceIntervalDays);
                setNextDueAt(dateInputValue(due));
              } else setNextDueAt('');
            }}
            renderInput={(params) => <TextField {...params} label={t('Artikel auswählen', 'Select item')} required />}
          />
          {serialized && <TextField select label={t('Gerät', 'Asset')} value={assetId} onChange={(event) => {
            setAssetId(event.target.value);
            const schedule = dateSchedules.find((candidate) => candidate.itemId === itemId && candidate.assetInstanceId === event.target.value);
            if (schedule) { setType(schedule.maintenanceType as MaintenanceType); setNextDueAt(scheduleDue(schedule)); }
          }} required>
            {assets.map((asset) => <MenuItem key={asset.id} value={asset.id}>{asset.assetCode}</MenuItem>)}
          </TextField>}
          {canPerformMaintenance(user) && <Button title={translate('Wartungspläne und Checklisten anzeigen', 'Display maintenance schedules and checklists')} component={Link} to="/operations?tab=schedules">{t('Wartungspläne und Checklisten öffnen', 'Open schedules and checklists')}</Button>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              fullWidth
              label={t('Prüftyp', 'Inspection type')}
              value={type}
              onChange={(event) => setType(event.target.value as typeof type)}
            >
              <MenuItem value="dguv_v3">DGUV V3 ({t('Elektrische Betriebsmittel', 'Electrical equipment')})</MenuItem>
              <MenuItem value="generator_service">{t('Generator-Service / Wartung', 'Generator service / maintenance')}</MenuItem>
              <MenuItem value="battery_test">{t('Batterietest / Akkupflege', 'Battery test / battery care')}</MenuItem>
              <MenuItem value="chrono_fps">Chrono / FPS ({t('Schusswaffen / Markierer', 'Firearms / blasters')})</MenuItem>
            </TextField>
            <TextField
              select
              fullWidth
              label={t('Ergebnis', 'Result')}
              value={result}
              onChange={(event) => setResult(event.target.value as typeof result)}
            >
              <MenuItem value="passed">{t('Bestanden (Plakette erteilt)', 'Passed (certified)')}</MenuItem>
              <MenuItem value="advisory">{t('Hinweis / Auflage (Nachbesserung)', 'Advisory (minor issue)')}</MenuItem>
              <MenuItem value="failed">{t('Nicht bestanden (Gesperrt)', 'Failed (locked)')}</MenuItem>
            </TextField>
          </Stack>

          {activeSchedule && <Alert severity="info">
            {t(`Diese Prüfung schreibt den Wartungsplan fort (alle ${activeSchedule.intervalValue} Tage).`, `This inspection advances the maintenance schedule (every ${activeSchedule.intervalValue} days).`)}
            {activeSchedule.requiredChecklist ? ` ${t('Pflichtprüfliste in den Notizen dokumentieren:', 'Document the required checklist in the notes:')} ${activeSchedule.requiredChecklist}` : ''}
          </Alert>}
          <Box>
            <TextField
              fullWidth
              type="date"
              label={t('Nächste Fälligkeit', 'Next due date')}
              value={nextDueAt}
              onChange={(event) => setNextDueAt(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center', mr: 0.5 }}>
                {t('Schnellauswahl', 'Presets')}:
              </Typography>
              <Button title={translate('Die nächste Prüfung auf ein Jahr ab heute setzen', 'Set the next inspection to one year from today')} size="small" variant="outlined" onClick={() => setNextDueAt(addYears(1))}>
                +1 {t('Jahr (DGUV V3)', 'Year (DGUV V3)')}
              </Button>
              <Button title={translate('Die nächste Prüfung auf sechs Monate ab heute setzen', 'Set the next inspection to six months from today')} size="small" variant="outlined" onClick={() => setNextDueAt(addMonths(6))}>
                +6 {t('Monate', 'Months')}
              </Button>
              <Button title={translate('Die nächste Prüfung auf zwei Jahre ab heute setzen', 'Set the next inspection to two years from today')} size="small" variant="outlined" onClick={() => setNextDueAt(addYears(2))}>
                +2 {t('Jahre', 'Years')}
              </Button>
            </Stack>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              label={t('Zertifikat / Protokollnummer', 'Certificate / protocol no.')}
              placeholder={t('z. B. DGUV-2026-081', 'e.g. DGUV-2026-081')}
              value={certificateNumber}
              onChange={(event) => setCertificateNumber(event.target.value)}
            />
            <TextField
              fullWidth
              type="number"
              label={t('Betriebsstunden', 'Operating hours')}
              value={operatingHours}
              onChange={(event) => setOperatingHours(event.target.value)}
            />
          </Stack>

          <TextField
            multiline
            minRows={2}
            label={t('Notizen & Prüfbemerkungen', 'Notes & remarks')}
            placeholder={t('z. B. Schutzleiterwiderstand 0,08 Ohm, Sichtprüfung i.O.', 'e.g. protective earth resistance 0.08 ohm, visual check passed.')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />

          {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}

          <Button title={translate('Das Prüfergebnis speichern und den Artikelstatus aktualisieren', 'Save the inspection result and update the item status')}
            variant="contained"
            size="large"
            color={result === 'failed' ? 'error' : result === 'advisory' ? 'warning' : 'primary'}
            disabled={!canPerformMaintenance(user) || !itemId || (serialized && !assets.some((asset) => asset.id === assetId)) || mutation.isPending}
            onClick={() => mutation.mutate()}
            sx={{ minHeight: 44 }}
          >
            {result === 'failed'
              ? t('Prüfung speichern & Artikel sperren', 'Save inspection & lock item')
              : result === 'advisory'
                ? t('Prüfung speichern (mit Auflagen)', 'Save inspection (with advisory)')
                : t('Prüfung speichern & Artikel freigeben', 'Save inspection & certify item')}
          </Button>
        </Stack>
      </Paper>

      {/* Recent Inspections History */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        <HistoryIcon color="primary" />
        <Typography variant="h6">{t('Letzte Prüfungen & Protokolle', 'Recent inspections & protocols')}</Typography>
      </Stack>

      {recordsLoading ? (
        <Typography color="text.secondary">{t('Prüfungen werden geladen...', 'Loading inspections...')}</Typography>
      ) : !records.some((record) => maintenanceItemIds.has(record.itemId)) ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">{t('Noch keine Prüfungen erfasst.', 'No inspections recorded yet.')}</Typography>
        </Paper>
      ) : (
        <Stack spacing={1}>
          {records.filter((record) => maintenanceItemIds.has(record.itemId)).slice(0, 50).map((record) => {
            const item = items.find((candidate) => candidate.id === record.itemId);
            return (
              <Card key={record.id} variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700 }}>{item?.name || record.itemId}</Typography>
                        <Chip size="small" variant="outlined" label={record.type} />
                        <Chip
                          size="small"
                          icon={record.result === 'passed' ? <CheckCircleIcon /> : <ErrorIcon />}
                          color={record.result === 'passed' ? 'success' : record.result === 'failed' ? 'error' : 'warning'}
                          label={
                            record.result === 'passed'
                              ? t('Bestanden', 'Passed')
                              : record.result === 'failed'
                              ? t('Nicht bestanden', 'Failed')
                              : t('Hinweis', 'Advisory')
                          }
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {t('Geprüft am', 'Inspected on')}: {formatDate(record.performedAt)}
                        {record.nextDueAt ? ` · ${t('Nächste Fälligkeit', 'Next due')}: ${formatDate(record.nextDueAt)}` : ''}
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
