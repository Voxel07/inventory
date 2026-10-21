import { formatDateTime } from '../../utils/dateFormat';
import { ActionBar } from '../shared/ActionBar';
import { useState } from 'react';
import { Alert, Box, LinearProgress, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Typography } from '@mui/material';
import { DateRangeField, TextField as MuiTextField } from '../shared/DateTextField';
import { Link } from 'react-router-dom';
import { reportApi } from '../../services/reportService';
import { useOperationalReport, useReportDefinitions } from '../../hooks/useOperationalReports';
import type { ReportFilters } from '../../types/report';
import { useOperationCommand } from '../../hooks/useOperations';
import { useItemsByIds } from '../../hooks/useItems';
import { ItemAutocomplete } from '../shared/ItemAutocomplete';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { useEventReports } from '../../hooks/useEvents';
import { holdsStock, locationPath } from '../../utils/locationHierarchy';
import { translate, useT } from '../../utils/naming';
import { reportPdf } from './reportPdf';

const TextField: typeof MuiTextField = (props) => <MuiTextField size="small" {...props} />;

const title = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const labels = { events: 'operations.reportsPanel.reportLabels.events', availability: 'operations.reportsPanel.reportLabels.availability', returns: 'operations.reportsPanel.reportLabels.returns', repairs: 'operations.reportsPanel.reportLabels.repairs', maintenance: 'operations.reportsPanel.reportLabels.maintenance', purchases: 'operations.reportsPanel.reportLabels.purchases', counts: 'operations.reportsPanel.reportLabels.counts', movements: 'operations.reportsPanel.reportLabels.movements' } as const;

export function ReportsPanel() {
  const t = useT(); const [name, setName] = useState('events'); const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<ReportFilters>({}); const command = useOperationCommand();
  const definitions = useReportDefinitions();
  const selectedItem = useItemsByIds(filters.itemId ? [filters.itemId] : []); const locations = useStorageLocations({ includeInactive: true }); const events = useEventReports(); const sites = (locations.data ?? []).filter((l) => !holdsStock(l));
  const report = useOperationalReport(name, filters, page);
  const change = (key: string, value: string) => { setFilters({ ...filters, [key]: value }); setPage(0); };
  const columns = [...new Set(report.data?.rows.flatMap((row) => Object.keys(row)) ?? [])].filter((key) => key !== 'id' && !key.endsWith('Id'));
  const [exporting, setExporting] = useState(false); const [exportError, setExportError] = useState('');
  /** Readable active filters for the PDF header. */
  function filterLabels(): string[] {
    const named: [string, string | undefined][] = [
      [t('common.item'), selectedItem.data?.[0]?.name ?? filters.itemId],
      [t('operations.reportsPanel.event'), events.data?.find((event) => event.id === filters.eventId)?.name ?? filters.eventId],
      [t('operations.reportsPanel.site'), sites.find((site) => site.id === filters.siteId)?.name ?? filters.siteId],
      [t('enum.value.location'), locations.data?.find((l) => l.id === filters.locationId)?.name ?? filters.locationId],
      [t('operations.reportsPanel.search'), filters.search], [t('common.status'), filters.status], [t('common.category'), filters.category],
      [t('operations.reportsPanel.from'), filters.from], [t('operations.reportsPanel.to'), filters.to],
    ];
    return named.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`);
  }
  function save(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function download(format: 'csv' | 'pdf') {
    setExporting(true); setExportError('');
    try {
      const { rows, generation, stale, definition } = await reportApi.exportRows(name, filters, t('operations.reportsPanel.reportRebuiltDuringExportPleaseRetry'), t('operations.reportsPanel.generationPending'));
      const fileName = `${name}-${generation?.slice(0, 10) ?? 'unbuilt'}.${format}`;
      if (format === 'pdf') {
        const label = labels[name as keyof typeof labels];
        save(await reportPdf({ title: label ? t(label) : title(name), definition: definition ?? definitions.data?.[name],
          generatedAt: generation ?? '', stale, filters: filterLabels(), rows, heading: title, t }), fileName);
        return;
      }
      const keys = [...new Set(rows.flatMap(Object.keys))];
      const cell = (value: unknown) => { let s = String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
      const csv = [keys.map(cell).join(','), ...rows.map((row) => keys.map((key) => cell(row[key])).join(','))].join('\r\n');
      save(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), fileName);
    } catch (e) { setExportError(e instanceof Error ? e.message : String(e)); } finally { setExporting(false); }
  }
  return <Stack spacing={2}>
    <Typography variant="h6">{t('operations.reportsPanel.operationalReports')}</Typography>
    <TextField select label={t('operations.reportsPanel.report')} value={name} onChange={(e) => { setName(e.target.value); setFilters({}); setPage(0); }}>{Object.entries(labels).map(([key, label]) => <MenuItem key={key} value={key}>{t(label)}</MenuItem>)}</TextField>
    <Typography variant="body2">{report.data?.definition ?? definitions.data?.[name]}</Typography>
    <Alert severity={report.data?.stale ? 'warning' : 'info'}>{report.data?.generatedAt ? <>{t('operations.reportsPanel.generated')}: {formatDateTime(report.data.generatedAt)} · {report.data.stale ? t('operations.reportsPanel.sourcesOrTimeReferenceChangedRebuildRequired') : t('operations.reportsPanel.asOfTheLastRebuild')}</> : t('operations.reportsPanel.noReportBuiltYetRebuildFromSourceRecordsNow')}</Alert>
    <ActionBar align="start" actions={[
      { key: 'rebuild', label: t('operations.reportsPanel.rebuildReport'), title: translate('operations.reportsPanel.recalculateThisReportUsingCurrentData'),
        variant: 'contained', pinned: true, disabled: command.isPending || ['pending', 'running', 'retry'].includes(report.data?.job.state ?? ''), onClick: () => command.mutate(async () => { await reportApi.rebuild(name); await report.refetch(); }) },
      { key: 'csv', label: t('operations.reportsPanel.exportFilteredCSV'), title: translate('operations.reportsPanel.downloadTheFilteredReportDataAsCSV'),
        variant: 'text', disabled: exporting || !report.data?.generatedAt, onClick: () => { void download('csv'); } },
      { key: 'pdf', label: t('operations.reportsPanel.exportFilteredPDF'), title: translate('operations.reportsPanel.downloadTheFilteredReportAsPDF'),
        variant: 'text', disabled: exporting || !report.data?.generatedAt, onClick: () => { void download('pdf'); } },
      { key: 'reset', label: t('operations.reportsPanel.resetFilters'), title: translate('operations.reportsPanel.resetAllReportFilters'),
        variant: 'text', onClick: () => { setFilters({}); setPage(0); } },
    ]} />
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
      <ItemAutocomplete label={t('operations.reportsPanel.itemEmptyAll')} value={filters.itemId} onChange={(item) => change('itemId', item?.id ?? '')} />
      {['events', 'returns', 'purchases', 'movements'].includes(name) && <TextField select fullWidth label={t('operations.reportsPanel.event')} value={filters.eventId ?? ''} onChange={(e) => change('eventId', e.target.value)}><MenuItem value="">{t('common.all')}</MenuItem>{events.data?.map((event) => <MenuItem key={event.id} value={event.id}>{event.name}</MenuItem>)}</TextField>}
      {['availability', 'repairs', 'maintenance', 'counts', 'movements'].includes(name) && <>
        <TextField select fullWidth label={t('operations.reportsPanel.site')} value={filters.siteId ?? ''} onChange={(e) => change('siteId', e.target.value)}><MenuItem value="">{t('common.all')}</MenuItem>{sites.map((site) => <MenuItem key={site.id} value={site.id}>{site.name}</MenuItem>)}</TextField>
        <TextField select fullWidth label={t('enum.value.location')} value={filters.locationId ?? ''} onChange={(e) => change('locationId', e.target.value)}><MenuItem value="">{t('common.all')}</MenuItem>{locations.data?.filter(holdsStock).map((l) => <MenuItem key={l.id} value={l.id}>{locationPath(l, locations.data ?? [])}</MenuItem>)}</TextField>
      </>}
    </Stack>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
      <TextField fullWidth label={t('operations.reportsPanel.search')} value={filters.search ?? ''} onChange={(e) => change('search', e.target.value)} />
      <TextField fullWidth label={t('operations.reportsPanel.statusExact')} value={filters.status ?? ''} onChange={(e) => change('status', e.target.value)} />
      <TextField fullWidth label={t('operations.reportsPanel.categoryExact')} value={filters.category ?? ''} onChange={(e) => change('category', e.target.value)} />
      <Box sx={{ flex: '2 1 0', minWidth: { md: 340 } }}>
        <DateRangeField startLabel={t('operations.reportsPanel.from')} endLabel={t('operations.reportsPanel.to')} start={filters.from ?? ''} end={filters.to ?? ''}
          onChange={(range) => { setFilters({ ...filters, from: range.start, to: range.end }); setPage(0); }} />
      </Box>
    </Stack>
    {(filters.from || filters.to) && <Typography variant="caption">{t('operations.reportsPanel.dateFiltersExcludeRowsWithNoDateTheDefinitionAbove')}</Typography>}
    {['pending', 'running', 'retry'].includes(report.data?.job.state ?? '') && <Alert severity="info">{t('operations.reportsPanel.generationPending')}</Alert>}
    {report.data?.job.state === 'failed' && <Alert severity="error">{t('operations.reportsPanel.generationFailed')}</Alert>}
    {(report.isFetching || command.isPending || exporting || ['pending', 'running', 'retry'].includes(report.data?.job.state ?? '')) && <LinearProgress />}
    {(report.error || definitions.error || command.error || exportError) && <Alert severity="error">{(report.error || definitions.error || command.error)?.message || exportError}</Alert>}
    {['purchases', 'movements'].includes(name) && <Typography variant="body2">{t('operations.reportsPanel.selectOneItemToSeeMonthlyTotalsByStatusAcross')}</Typography>}
    {!!report.data?.monthlyTotals.length && <TableContainer><Table size="small"><TableHead><TableRow>{Object.keys(report.data.monthlyTotals[0]).map((key) => <TableCell key={key}>{title(key)}</TableCell>)}</TableRow></TableHead><TableBody>{report.data.monthlyTotals.map((row, i) => <TableRow key={i}>{Object.entries(row).map(([key, value]) => <TableCell key={key}>{String(value ?? '—')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>}
    <TableContainer component={Box} sx={{ maxHeight: 600 }}><Table size="small" stickyHeader><TableHead><TableRow>{columns.map((key) => <TableCell key={key}>{title(key)}</TableCell>)}</TableRow></TableHead><TableBody>{report.data?.rows.map((row, index) => <TableRow key={String(row.id ?? index)}>{columns.map((key) => <TableCell key={key} sx={{ minWidth: 90, overflowWrap: 'anywhere' }}>{key === 'item' && row.itemId ? <Link to={`/items/${row.itemId}`}>{String(row[key])}</Link> : key === 'event' && row.eventId ? <Link to={`/events/${row.eventId}`}>{String(row[key])}</Link> : String(row[key] ?? '—')}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer>
    {!report.isLoading && report.data?.generatedAt && !report.data.total && <Alert severity="info">{t('operations.reportsPanel.noMatchingRecords')}</Alert>}
    <TablePagination component="div" count={report.data?.total ?? 0} page={page} rowsPerPage={50} rowsPerPageOptions={[50]} onPageChange={(_, value) => setPage(value)} />
  </Stack>;
}
