import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import { useItems } from '../hooks/useItems';
import { createMaintenanceRecord, getMaintenanceRecords } from '../services/maintenanceService';
import { useTranslate } from '../utils/naming';

export function Maintenance() {
  const t = useTranslate();
  const queryClient = useQueryClient();
  const { data: items = [] } = useItems();
  const { data: records = [] } = useQuery({ queryKey: ['maintenance'], queryFn: () => getMaintenanceRecords() });
  const [itemId, setItemId] = useState('');
  const [type, setType] = useState<'dguv_v3' | 'generator_service' | 'battery_test' | 'chrono_fps'>('dguv_v3');
  const [result, setResult] = useState<'passed' | 'failed' | 'advisory'>('passed');
  const [nextDueAt, setNextDueAt] = useState('');
  const [certificateNumber, setCertificateNumber] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [notes, setNotes] = useState('');
  const mutation = useMutation({
    mutationFn: () => createMaintenanceRecord({ itemId, type, result, performedAt: new Date().toISOString(), nextDueAt: nextDueAt ? new Date(`${nextDueAt}T12:00:00Z`).toISOString() : undefined, certificateNumber: certificateNumber || undefined, operatingHours: operatingHours ? Number(operatingHours) : undefined, notes: notes || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['maintenance'] }); queryClient.invalidateQueries({ queryKey: ['items'] }); setNotes(''); },
  });
  const attention = items.filter((item) => item.maintenanceStatus === 'overdue' || item.maintenanceStatus === 'due_soon' || item.maintenanceStatus === 'in_service');

  return (
    <Box>
      <Typography variant="h4">{t('Wartung & Prüfungen', 'Maintenance & inspections')}</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>{t('DGUV V3, Serviceintervalle, Batterietests und Chrono-Protokolle.', 'DGUV V3, service intervals, battery tests, and chrono records.')}</Typography>
      {!!attention.length && <Alert severity="warning" sx={{ mb: 2 }}>{attention.length} {t('Artikel benötigen Aufmerksamkeit. Überfällige oder im Service befindliche Artikel sind für die Ausgabe gesperrt.', 'items need attention. Overdue or in-service items are blocked from checkout.')}</Alert>}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}><BuildIcon color="primary" /><Typography variant="h6">{t('Prüfung erfassen', 'Record inspection')}</Typography></Stack>
        <Stack spacing={2}>
          <Autocomplete options={items} getOptionLabel={(item) => `${item.name} (${item.maintenanceStatus || 'certified'})`} value={items.find((item) => item.id === itemId) || null} onChange={(_, item) => setItemId(item?.id || '')} renderInput={(params) => <TextField {...params} label={t('Artikel', 'Item')} />} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select fullWidth label={t('Prüftyp', 'Inspection type')} value={type} onChange={(event) => setType(event.target.value as typeof type)}><MenuItem value="dguv_v3">DGUV V3</MenuItem><MenuItem value="generator_service">{t('Generator-Service', 'Generator service')}</MenuItem><MenuItem value="battery_test">{t('Batterietest', 'Battery test')}</MenuItem><MenuItem value="chrono_fps">Chrono / FPS</MenuItem></TextField>
            <TextField select fullWidth label={t('Ergebnis', 'Result')} value={result} onChange={(event) => setResult(event.target.value as typeof result)}><MenuItem value="passed">{t('Bestanden', 'Passed')}</MenuItem><MenuItem value="advisory">{t('Hinweis', 'Advisory')}</MenuItem><MenuItem value="failed">{t('Nicht bestanden', 'Failed')}</MenuItem></TextField>
            <TextField fullWidth type="date" label={t('Nächste Fälligkeit', 'Next due')} value={nextDueAt} onChange={(event) => setNextDueAt(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField fullWidth label={t('Zertifikat / Protokoll', 'Certificate / protocol')} value={certificateNumber} onChange={(event) => setCertificateNumber(event.target.value)} /><TextField fullWidth type="number" label={t('Betriebsstunden', 'Operating hours')} value={operatingHours} onChange={(event) => setOperatingHours(event.target.value)} /></Stack>
          <TextField multiline minRows={2} label={t('Notizen', 'Notes')} value={notes} onChange={(event) => setNotes(event.target.value)} />
          {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
          <Button variant="contained" disabled={!itemId || mutation.isPending} onClick={() => mutation.mutate()}>{t('Prüfung speichern', 'Save inspection')}</Button>
        </Stack>
      </Paper>
      <Typography variant="h6" sx={{ mb: 1 }}>{t('Letzte Prüfungen', 'Recent inspections')}</Typography>
      <Stack spacing={1}>{records.slice(0, 50).map((record) => { const item = items.find((candidate) => candidate.id === record.itemId); return <Paper key={record.id} sx={{ p: 1.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}><Typography sx={{ fontWeight: 800, flex: 1 }}>{item?.name || record.itemId}</Typography><Chip size="small" label={record.type} /><Chip size="small" color={record.result === 'passed' ? 'success' : record.result === 'failed' ? 'error' : 'warning'} label={record.result} /><Typography variant="body2">{new Date(record.performedAt).toLocaleDateString()}</Typography></Stack></Paper>; })}</Stack>
    </Box>
  );
}
