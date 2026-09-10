import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
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
import { useItems } from '../hooks/useItems';
import { createMaintenanceRecord, getMaintenanceRecords } from '../services/maintenanceService';
import { useUIStore } from '../store/uiStore';
import { useTranslate } from '../utils/naming';
import type { Item } from '../types';

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function Maintenance() {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const showSnackbar = useUIStore((s) => s.showSnackbar);
  const formRef = useRef<HTMLDivElement | null>(null);

  const { data: items = [] } = useItems();
  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['maintenance'],
    queryFn: () => getMaintenanceRecords(),
  });

  const [itemId, setItemId] = useState('');
  const [type, setType] = useState<'dguv_v3' | 'generator_service' | 'battery_test' | 'chrono_fps'>('dguv_v3');
  const [result, setResult] = useState<'passed' | 'failed' | 'advisory'>('passed');
  const [nextDueAt, setNextDueAt] = useState('');
  const [certificateNumber, setCertificateNumber] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createMaintenanceRecord({
        itemId,
        type,
        result,
        performedAt: new Date().toISOString(),
        nextDueAt: nextDueAt ? new Date(`${nextDueAt}T12:00:00Z`).toISOString() : undefined,
        certificateNumber: certificateNumber || undefined,
        operatingHours: operatingHours ? Number(operatingHours) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
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

  const attention = items.filter(
    (item) =>
      item.maintenanceStatus === 'overdue' ||
      item.maintenanceStatus === 'due_soon' ||
      item.maintenanceStatus === 'in_service'
  );

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
    setNextDueAt(addYears(1));
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

      {/* Attention / Overdue Section */}
      {!!attention.length && (
        <Paper sx={{ p: 2, mb: 3, borderLeft: 4, borderColor: 'warning.main' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
            <WarningAmberIcon color="warning" />
            <Typography variant="h6">
              {t('Fällige & überfällige Prüfungen', 'Due & overdue inspections')} ({attention.length})
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
                          icon={item.maintenanceStatus === 'overdue' ? <ErrorIcon /> : <WarningAmberIcon />}
                          color={item.maintenanceStatus === 'overdue' ? 'error' : item.maintenanceStatus === 'in_service' ? 'info' : 'warning'}
                          label={
                            item.maintenanceStatus === 'overdue'
                              ? t('Überfällig', 'Overdue')
                              : item.maintenanceStatus === 'in_service'
                              ? t('Im Service', 'In service')
                              : t('Bald fällig', 'Due soon')
                          }
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {item.category ? `${item.category} · ` : ''}
                        {item.expand?.storageLocation?.name || item.storageLocation || t('Kein Lagerort', 'No location')}
                        {item.nextMaintenanceDue ? ` · ${t('Fällig seit', 'Due since')}: ${new Date(item.nextMaintenanceDue).toLocaleDateString()}` : ''}
                      </Typography>
                    </Box>
                    <Button
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
          </Stack>
        </Paper>
      )}

      {/* Record Inspection Form */}
      <Paper ref={formRef} sx={{ p: 2.5, mb: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
          <BuildIcon color="primary" />
          <Typography variant="h6">{t('Prüfung erfassen', 'Record inspection')}</Typography>
        </Stack>
        <Stack spacing={2}>
          <Autocomplete
            options={items}
            getOptionLabel={(item) => `${item.name} (${item.maintenanceStatus || 'certified'})`}
            value={items.find((item) => item.id === itemId) || null}
            onChange={(_, item) => setItemId(item?.id || '')}
            renderInput={(params) => <TextField {...params} label={t('Artikel auswählen', 'Select item')} required />}
          />
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
              <Button size="small" variant="outlined" onClick={() => setNextDueAt(addYears(1))}>
                +1 {t('Jahr (DGUV V3)', 'Year (DGUV V3)')}
              </Button>
              <Button size="small" variant="outlined" onClick={() => setNextDueAt(addMonths(6))}>
                +6 {t('Monate', 'Months')}
              </Button>
              <Button size="small" variant="outlined" onClick={() => setNextDueAt(addYears(2))}>
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

          <Button
            variant="contained"
            size="large"
            color={result === 'failed' ? 'error' : result === 'advisory' ? 'warning' : 'primary'}
            disabled={!itemId || mutation.isPending}
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
      ) : !records.length ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">{t('Noch keine Prüfungen erfasst.', 'No inspections recorded yet.')}</Typography>
        </Paper>
      ) : (
        <Stack spacing={1}>
          {records.slice(0, 50).map((record) => {
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
                        {t('Geprüft am', 'Inspected on')}: {new Date(record.performedAt).toLocaleDateString()}
                        {record.nextDueAt ? ` · ${t('Nächste Fälligkeit', 'Next due')}: ${new Date(record.nextDueAt).toLocaleDateString()}` : ''}
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
