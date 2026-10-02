import { Button } from '../shared/ActionButtons';
import { useState } from 'react';
import { Alert, Box, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField as MuiTextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { reportApi } from '../../services/reportService';
import { useOperationalReport, useReportDefinitions } from '../../hooks/useOperationalReports';
import type { ReportFilters } from '../../types/report';
import { useOperationCommand, useOperationList } from '../../hooks/useOperations';
import { useItems } from '../../hooks/useItems';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useEventReports } from '../../hooks/useEvents';
import { getWarehouses } from '../../services/warehouseService';
import { locationPath } from '../../utils/locationHierarchy';
import { translate, useLocalizedText } from '../../utils/naming';

const TextField: typeof MuiTextField = (props) => <MuiTextField size="small" {...props} />;

const title = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const labels = { events: ['Eventbedarf und Nutzung', 'Event demand and use'], availability: ['Verfügbarkeit nach Lagerort', 'Availability by location'], returns: ['Offene Rückgaben', 'Unresolved returns'], repairs: ['Reparaturrückstand', 'Repair backlog'], maintenance: ['Wartungsbedarf', 'Maintenance due'], purchases: ['Einkaufshistorie', 'Purchase history'], counts: ['Inventurdifferenzen', 'Count variance'], movements: ['Verbrauch und Abschreibungen', 'Consumption and write-offs'] } as const;

export function ReportsPanel() {
  const t = useLocalizedText(); const [name, setName] = useState('events'); const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<ReportFilters>({}); const command = useOperationCommand();
  const definitions = useReportDefinitions();
  const items = useItems(); const locations = useStorageLocations({ includeInactive: true }); const events = useEventReports(); const warehouses = useOperationList('warehouses', getWarehouses);
  const report = useOperationalReport(name, filters, page);
  const change = (key: string, value: string) => { setFilters({ ...filters, [key]: value }); setPage(0); };
  const columns = [...new Set(report.data?.rows.flatMap((row) => Object.keys(row)) ?? [])].filter((key) => key !== 'id' && !key.endsWith('Id'));
  const [exporting, setExporting] = useState(false); const [exportError, setExportError] = useState('');
  async function download() {
    setExporting(true); setExportError('');
    try {
      const { rows, generation } = await reportApi.exportRows(name, filters, t('Bericht wurde während des Exports neu erstellt. Bitte wiederholen.', 'Report rebuilt during export. Please retry.'));
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
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}><Button title={translate('Diesen Bericht mit aktuellen Daten neu berechnen', 'Recalculate this report using current data')} variant="contained" disabled={command.isPending} onClick={() => command.mutate(() => reportApi.rebuild(name))}>{t('Neu berechnen', 'Rebuild report')}</Button><Button title={translate('Die gefilterten Berichtsdaten als CSV herunterladen', 'Download the filtered report data as CSV')} disabled={exporting || !report.data?.generatedAt} onClick={() => { void download(); }}>{t('Gefilterte Daten als CSV', 'Export filtered CSV')}</Button><Button title={translate('Alle Berichtsfilter zurücksetzen', 'Reset all report filters')} onClick={() => { setFilters({}); setPage(0); }}>{t('Filter zurücksetzen', 'Reset filters')}</Button></Stack>
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
