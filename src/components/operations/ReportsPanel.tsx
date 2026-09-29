import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/apiClient';
import { useOperationCommand, useOperationList } from '../../hooks/useOperations';
import { useItems } from '../../hooks/useItems';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useEventReports } from '../../hooks/useEvents';
import { getWarehouses } from './WarehousesPanel';
import { locationPath } from '../../utils/locationHierarchy';
import { useLocalizedText } from '../../utils/naming';

type Row = Record<string, string | number | boolean | null>;
interface Report { name: string; definition: string; startedAt: string | null; generatedAt: string | null; stale: boolean; total: number; rows: Row[]; monthlyTotals: Row[] }
const title = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const labels = { events: ['Eventbedarf und Nutzung', 'Event demand and use'], availability: ['Verfügbarkeit nach Lagerort', 'Availability by location'], returns: ['Offene Rückgaben', 'Unresolved returns'], repairs: ['Reparaturrückstand', 'Repair backlog'], maintenance: ['Wartungsbedarf', 'Maintenance due'], purchases: ['Einkaufshistorie', 'Purchase history'], counts: ['Inventurdifferenzen', 'Count variance'], movements: ['Verbrauch und Abschreibungen', 'Consumption and write-offs'] } as const;
const getDefinitions = () => apiRequest<Record<string, string>>('/api/reports');

export function ReportsPanel() {
  const t = useLocalizedText(); const [name, setName] = useState('events'); const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({}); const command = useOperationCommand();
  const definitions = useQuery({ queryKey: ['reports', 'definitions'], queryFn: getDefinitions });
  const items = useItems(); const locations = useStorageLocations({ includeInactive: true }); const events = useEventReports(); const warehouses = useOperationList('warehouses', getWarehouses);
  const report = useQuery({ queryKey: ['reports', name, filters, page], queryFn: () => apiRequest<Report>(`/api/reports/${name}`, { query: { ...filters, page, size: 50 } }), refetchInterval: 60000 });
  const change = (key: string, value: string) => { setFilters({ ...filters, [key]: value }); setPage(0); };
  const columns = [...new Set(report.data?.rows.flatMap((row) => Object.keys(row)) ?? [])].filter((key) => key !== 'id' && !key.endsWith('Id'));
  const [exporting, setExporting] = useState(false); const [exportError, setExportError] = useState('');
  async function download() {
    setExporting(true); setExportError('');
    try {
      const rows: Row[] = []; let generation: string | null | undefined;
      for (let index = 0; ; index++) {
        const data = await apiRequest<Report>(`/api/reports/${name}`, { query: { ...filters, page: index, size: 200 } });
        if (generation !== undefined && generation !== data.generatedAt) throw new Error(t('Bericht wurde während des Exports neu erstellt. Bitte wiederholen.', 'Report rebuilt during export. Please retry.'));
        generation = data.generatedAt; rows.push(...data.rows); if (rows.length >= data.total || !data.rows.length) break;
      }
      const keys = [...new Set(rows.flatMap(Object.keys))];
      const cell = (value: unknown) => { let s = String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
      const csv = [keys.map(cell).join(','), ...rows.map((row) => keys.map((key) => cell(row[key])).join(','))].join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `${name}-${generation?.slice(0, 10) ?? 'unbuilt'}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setExportError(e instanceof Error ? e.message : String(e)); } finally { setExporting(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h6">{t('Betriebsberichte', 'Operational reports')}</Typography>
    <TextField select label={t('Bericht', 'Report')} value={name} onChange={(e) => { setName(e.target.value); setFilters({}); setPage(0); }}>{Object.entries(labels).map(([key, label]) => <MenuItem key={key} value={key}>{t(label[0], label[1])}</MenuItem>)}</TextField>
    <Typography variant="body2">{report.data?.definition ?? definitions.data?.[name]}</Typography>
    <Alert severity={report.data?.stale ? 'warning' : 'info'}>{report.data?.generatedAt ? <>{t('Erstellt', 'Generated')}: {new Date(report.data.generatedAt).toLocaleString()} · {report.data.stale ? t('Quelldaten oder Zeitbezug haben sich geändert. Neu berechnen.', 'Sources or time reference changed. Rebuild required.') : t('Stand der letzten Berechnung', 'As of the last rebuild')}</> : t('Noch kein Bericht erstellt. Jetzt aus den Quelldaten neu berechnen.', 'No report built yet. Rebuild from source records now.')}</Alert>
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}><Button variant="contained" disabled={command.isPending} onClick={() => command.mutate(() => apiRequest(`/api/reports/${name}/rebuild`, { method: 'POST' }))}>{t('Neu berechnen', 'Rebuild report')}</Button><Button disabled={exporting || !report.data?.generatedAt} onClick={() => { void download(); }}>{t('Gefilterte Daten als CSV', 'Export filtered CSV')}</Button><Button onClick={() => { setFilters({}); setPage(0); }}>{t('Filter zurücksetzen', 'Reset filters')}</Button></Stack>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
      <TextField select fullWidth label={t('Artikel', 'Item')} value={filters.itemId ?? ''} onChange={(e) => change('itemId', e.target.value)}><MenuItem value="">{t('Alle', 'All')}</MenuItem>{items.data?.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>
      {['events', 'returns', 'purchases', 'movements'].includes(name) && <TextField select fullWidth label={t('Veranstaltung', 'Event')} value={filters.eventId ?? ''} onChange={(e) => change('eventId', e.target.value)}><MenuItem value="">{t('Alle', 'All')}</MenuItem>{events.data?.map((event) => <MenuItem key={event.id} value={event.id}>{event.name}</MenuItem>)}</TextField>}
      {['availability', 'repairs', 'maintenance', 'counts', 'movements'].includes(name) && <>
        <TextField select fullWidth label={t('Standort', 'Warehouse')} value={filters.warehouseId ?? ''} onChange={(e) => change('warehouseId', e.target.value)}><MenuItem value="">{t('Alle', 'All')}</MenuItem>{warehouses.data?.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}</TextField>
        <TextField select fullWidth label={t('Lagerort', 'Location')} value={filters.locationId ?? ''} onChange={(e) => change('locationId', e.target.value)}><MenuItem value="">{t('Alle', 'All')}</MenuItem>{locations.data?.map((l) => <MenuItem key={l.id} value={l.id}>{locationPath(l, locations.data ?? [])}</MenuItem>)}</TextField>
      </>}
    </Stack>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
      <TextField fullWidth label={t('Suche', 'Search')} value={filters.search ?? ''} onChange={(e) => change('search', e.target.value)} />
      <TextField fullWidth label={t('Status (exakt)', 'Status (exact)')} value={filters.status ?? ''} onChange={(e) => change('status', e.target.value)} />
      <TextField fullWidth label={t('Kategorie (exakt)', 'Category (exact)')} value={filters.category ?? ''} onChange={(e) => change('category', e.target.value)} />
      <TextField type="date" label={t('Von', 'From')} slotProps={{ inputLabel: { shrink: true } }} value={filters.from ?? ''} onChange={(e) => change('from', e.target.value)} />
      <TextField type="date" label={t('Bis', 'To')} slotProps={{ inputLabel: { shrink: true } }} value={filters.to ?? ''} onChange={(e) => change('to', e.target.value)} />
    </Stack>
    {(filters.from || filters.to) && <Typography variant="caption">{t('Datumsfilter schließen Zeilen ohne Bezugsdatum aus. Die Definition oben beschreibt das Datum dieses Berichts.', 'Date filters exclude rows with no date. The definition above describes the date used by this report.')}</Typography>}
    {(report.isFetching || command.isPending || exporting) && <LinearProgress />}
    {(report.error || definitions.error || command.error || exportError) && <Alert severity="error">{(report.error || definitions.error || command.error)?.message || exportError}</Alert>}
    {['purchases', 'movements'].includes(name) && <Typography variant="body2">{t('Einen Artikel wählen, um Monatssummen nach Status für alle gefilterten Zeilen zu sehen.', 'Select one item to see monthly totals by status across all filtered rows.')}</Typography>}
    {!!report.data?.monthlyTotals.length && <TableContainer><Table size="small"><TableHead><TableRow>{Object.keys(report.data.monthlyTotals[0]).map((key) => <TableCell key={key}>{title(key)}</TableCell>)}</TableRow></TableHead><TableBody>{report.data.monthlyTotals.map((row, i) => <TableRow key={i}>{Object.entries(row).map(([key, value]) => <TableCell key={key}>{String(value ?? '—')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>}
    <TableContainer component={Box} sx={{ maxHeight: 600 }}><Table size="small" stickyHeader><TableHead><TableRow>{columns.map((key) => <TableCell key={key}>{title(key)}</TableCell>)}</TableRow></TableHead><TableBody>{report.data?.rows.map((row, index) => <TableRow key={String(row.id ?? index)}>{columns.map((key) => <TableCell key={key} sx={{ minWidth: 90, overflowWrap: 'anywhere' }}>{key === 'item' && row.itemId ? <Link to={`/items/${row.itemId}`}>{String(row[key])}</Link> : key === 'event' && row.eventId ? <Link to={`/events/${row.eventId}`}>{String(row[key])}</Link> : String(row[key] ?? '—')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>
    {!report.isLoading && report.data?.generatedAt && !report.data.total && <Alert severity="info">{t('Keine passenden Datensätze.', 'No matching records.')}</Alert>}
    <TablePagination component="div" count={report.data?.total ?? 0} page={page} rowsPerPage={50} rowsPerPageOptions={[50]} onPageChange={(_, value) => setPage(value)} />
  </Stack>;
}
