import { TaskToolbar } from '../operations/TaskToolbar';
import { taskSearch, useTaskFilters, useTaskPage } from '../../hooks/useWarehouseTasks';
import { OperationHistory } from '../operations/OperationListEntry';
import { Button } from '../shared/ActionButtons';
import { ActionBar } from '../shared/ActionBar';
import { useFactionCatalog } from '../../hooks/useFactionCatalog';
import { SupplierDraft } from './SupplierDraft';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@mui/material';
import { getProcurementDeficits, shortageLine, type ProcurementDeficit } from '../../services/procurementService';
import { PurchaseDraft } from '../operations/PurchasingOperations';
import { PlanningDetails } from './PlanningDetails';
import { useEventReports } from '../../hooks/useEvents';
import { translate, useT } from '../../utils/naming';
import { formatDate } from '../../utils/dateFormat';
import { csvCell } from '../../utils/csvExport';

const toOrder = (row: ProcurementDeficit) => Math.max(0, row.netDeficit - (row.orderedStock ?? 0));

export function ReplenishmentPanel() {
  const t = useT();
  const { eventTypes } = useFactionCatalog();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const filters = useTaskFilters('replenishment', { status: 'needed' });
  const eventId = filters.values.eventId;
  const setEventId = (value: string) => filters.set('eventId', value);
  const [orderItem, setOrderItem] = useState<ProcurementDeficit | null>(null);
  const { data: events = [] } = useEventReports();
  const { data: deficits = [], isPending, isFetching, fetchStatus, error } = useQuery({
    queryKey: ['procurement-deficits', eventId],
    queryFn: () => getProcurementDeficits(eventId || undefined),
  });
  const filtered = deficits.filter(row => taskSearch(filters.values.search, row.name, row.sku, row.supplier, row.category)
    && (!filters.values.kind || row.classification === filters.values.kind)
    && (!filters.values.vendorId || (row.supplier || t('common.unassigned')) === filters.values.vendorId)
    && (filters.values.status === 'needed' ? toOrder(row) > 0 : filters.values.status === 'covered' ? toOrder(row) === 0 : true))
    .sort((a, b) => (a.supplier || t('common.unassigned')).localeCompare(b.supplier || t('common.unassigned')) || a.name.localeCompare(b.name));
  const page = useTaskPage(filtered, JSON.stringify(filters.values));
  const groups = (() => {
    const result = new Map<string, typeof deficits>();
    for (const row of page.rows) {
      const supplier = row.supplier || t('common.unassigned');
      const rows = result.get(supplier);
      if (rows) rows.push(row);
      else result.set(supplier, [row]);
    }
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
  })();

  // Totals and exports describe every filtered result, across all visible pages.
  const consumableDeficitUnits = filtered.filter((r) => r.classification === 'consumable').reduce((sum, r) => sum + toOrder(r), 0);
  const assetDeficitUnits = filtered.filter((r) => r.classification !== 'consumable').reduce((sum, r) => sum + toOrder(r), 0);

  function exportCsv() {
    const header = ['supplier', 'sku', 'name', 'classification', 'demand', 'available', 'projected', 'deficit', 'ordered', 'to_order', 'action'];
    const rows = filtered.map((row) => [
      row.supplier,
      row.sku,
      row.name,
      row.classification,
      row.demand,
      row.availableStock,
      row.projectedStock,
      row.netDeficit,
      row.orderedStock ?? 0,
      toOrder(row),
      row.recommendedAction,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `procurement-${eventId || 'all-events'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    // Loaded on demand so jspdf (~630 kB incl. html2canvas/dompurify) stays out of the route bundle.
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const selectedEvent = events.find((e) => e.id === eventId);
    const scopeLabel = selectedEvent
      ? `${selectedEvent.name || selectedEvent.eventType} (${formatDate(selectedEvent.eventDate)})`
      : t('pages.procurement.allPlannedEvents');

    let y = 18;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(t('pages.procurement.procurementShortageList'), 14, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${t('common.scope')}: ${scopeLabel} · ${t('pages.procurement.date')}: ${formatDate(new Date())}`,
      14,
      y
    );
    y += 5;
    doc.text(
      `${t('pages.procurement.stillToOrder')}: ${consumableDeficitUnits + assetDeficitUnits} ${t('pages.procurement.units')} · ${new Set(filtered.map(row => row.supplier)).size} ${t('pages.procurement.suppliers')}`,
      14,
      y
    );
    y += 8;

    const exportGroups = new Map<string, ProcurementDeficit[]>();
    for (const row of filtered) {
      const supplier = row.supplier || t('common.unassigned');
      exportGroups.set(supplier, [...(exportGroups.get(supplier) ?? []), row]);
    }
    for (const [supplier, rows] of exportGroups) {
      if (y > 260) {
        doc.addPage();
        y = 18;
      }

      doc.setFillColor(240, 240, 240);
      doc.rect(14, y - 4, 182, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const supplierDeficit = rows.reduce((sum, r) => sum + toOrder(r), 0);
      doc.text(`${supplier} (${supplierDeficit} ${t('pages.procurement.units')})`, 16, y + 1);
      y += 6;

      // Table headers
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(t('pages.procurement.sKU'), 14, y + 3);
      doc.text(t('pages.procurement.itemName'), 40, y + 3);
      doc.text(t('common.type'), 105, y + 3);
      doc.text(t('pages.procurement.demand'), 130, y + 3);
      doc.text(t('common.stock'), 148, y + 3);
      doc.text(t('pages.procurement.toOrder'), 168, y + 3);
      doc.text(t('common.action'), 184, y + 3);
      y += 6;

      doc.setFont('helvetica', 'normal');
      for (const row of rows) {
        if (y > 275) {
          doc.addPage();
          y = 18;
        }
        doc.text(row.sku || '—', 14, y + 2);
        doc.text(doc.splitTextToSize(row.name, 62), 40, y + 2);
        doc.text(row.classification === 'consumable' ? t('pages.procurement.consumable') : 'Asset', 105, y + 2);
        doc.text(String(row.demand), 130, y + 2);
        doc.text(String(row.availableStock), 148, y + 2);
        doc.setFont('helvetica', 'bold');
        doc.text(String(toOrder(row)), 168, y + 2);
        doc.setFont('helvetica', 'normal');
        doc.text(row.recommendedAction === 'obtain_commitment' ? t('pages.procurement.obtainCommitment') : row.recommendedAction === 'purchase' ? t('pages.procurement.buy') : t('pages.procurement.rent'), 184, y + 2);
        y += 6;
      }
      y += 4;
    }


    doc.save(`beschaffung-${eventId || 'alle-events'}.pdf`);
  }

  return (
    <Box aria-busy={isPending || isFetching}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2 }}>
        <Typography color="text.secondary">{t('pages.procurement.activeDemandAndMinimumStockShortagesGroupedBySupplier')}</Typography>
        <ActionBar actions={[
          { key: 'csv', label: t('pages.procurement.cSV'), title: translate('pages.procurement.downloadTheCurrentShortagesAsCSV'), icon: <DownloadIcon />,
            disabled: !filtered.length, onClick: exportCsv },
          { key: 'pdf', label: t('pages.procurement.purchaseOrderPDF'), title: translate('pages.procurement.downloadThePurchaseOrderSheetAsPDF'), icon: <PrintIcon />,
            variant: 'contained', pinned: true, disabled: !filtered.length, onClick: exportPdf },
        ]} />
      </Stack>

      <TaskToolbar state={filters} count={filtered.length} loading={isFetching} searchLabel={t('operations.tasks.purchaseSearch')}
        filters={[
          { key: 'status', label: t('operations.tasks.demand'), options: [
            { value: 'needed', label: t('operations.tasks.needed') }, { value: 'covered', label: t('operations.tasks.covered') }, { value: '', label: t('operations.tasks.allShortages') },
          ] },
          { key: 'kind', label: t('common.type'), options: [{ value: '', label: t('operations.tasks.allTypes') }, { value: 'consumable', label: t('pages.procurement.consumable') }, { value: 'asset', label: t('pages.procurement.asset') }] },
          { key: 'vendorId', label: t('common.supplier'), options: [{ value: '', label: t('operations.tasks.allSuppliers') }, ...[...new Set(deficits.map(row => row.supplier || t('common.unassigned')))].sort().map(value => ({ value, label: value }))] },
        ]} />
      <Typography variant="body2" color="text.secondary" sx={{ my: 1.5 }}>
        {t('pages.procurement.stillToOrder')}: {consumableDeficitUnits + assetDeficitUnits} {t('pages.procurement.units')}
      </Typography>

      <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 260 }, mb: { xs: 2, md: 3 } }}>
        <InputLabel shrink>{t('pages.procurement.eventScope')}</InputLabel>
        <Select displayEmpty value={eventId} label={t('pages.procurement.eventScope')} onChange={(event) => setEventId(event.target.value)}>
          <MenuItem value="">{t('pages.procurement.allPlannedEvents')}</MenuItem>
          {eventTypes.flatMap((type) => {
            const occurrences = events.filter((event) => event.eventType === type);
            return occurrences.length ? [
              <ListSubheader key={`${type}-heading`}>{type === 'LS' ? 'LightSim' : type}</ListSubheader>,
              ...occurrences.map((event) => <MenuItem key={event.id} value={event.id}>{event.name} · {formatDate(event.startDate)}{event.endDate !== event.startDate ? ` – ${formatDate(event.endDate)}` : ''}</MenuItem>),
            ] : [];
          })}
        </Select>
      </FormControl>

      {error && (
        <Alert severity="error">
          {error instanceof Error ? error.message : t('pages.procurement.couldNotLoadDeficits')}
        </Alert>
      )}
      {!isPending && !error && !filtered.length && (
        <Alert severity="info">{t(deficits.length ? 'operations.tasks.noMatches' : 'pages.procurement.noShortagesInTheSelectedScope')}</Alert>
      )}

      <Stack spacing={2}>
        {isPending && <>
          <Typography role="status" variant="body2" color="text.secondary">
            {fetchStatus === 'paused'
              ? t('pages.procurement.waitingForANetworkConnection')
              : t('pages.procurement.loadingStockDemandAndDeliveries')}
          </Typography>
          {[0, 1].map((group) => <Paper key={group} aria-hidden="true" sx={{ p: 2 }}>
            <Skeleton variant="text" width="40%" height={36} sx={{ mb: 2 }} />
            <Stack spacing={1}>
              {[0, 1, 2].map((row) => isMobile
                ? <Card key={row} variant="outlined" sx={{ p: 1.5 }}>
                  <Skeleton variant="text" width="70%" />
                  <Skeleton variant="text" width="40%" />
                  <Skeleton variant="rounded" height={28} sx={{ mt: 1 }} />
                </Card>
                : <Box key={row} sx={{ display: 'grid', gridTemplateColumns: '1fr 3fr repeat(4, 1fr)', gap: 2 }}>
                  {[0, 1, 2, 3, 4, 5].map((cell) => <Skeleton key={cell} variant="text" height={32} />)}
                </Box>)}
            </Stack>
          </Paper>)}
        </>}
        {isFetching && !isPending && <Typography role="status" variant="body2" color="text.secondary">
          {t('pages.procurement.updatingShortages')}
        </Typography>}
        {groups.map(([supplier, rows]) => (
          <Paper key={supplier}>
            <SupplierDraft rows={filtered.filter(row => (row.supplier || t('common.unassigned')) === supplier)} eventId={eventId} />
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ alignItems: 'center', flexWrap: 'wrap', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <ShoppingCartIcon color="primary" />
              <Typography variant="h6" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{supplier}</Typography>
              <Chip
                size="small"
                color="error"
                variant="outlined"
                label={`${rows.reduce((sum, row) => sum + row.netDeficit, 0)} ${t('pages.procurement.unitsDeficit')}`}
              />
            </Stack>

            {isMobile ? (
              <Stack spacing={1} sx={{ p: 1.5 }}>
                {rows.map((row) => (
                  <Card key={row.itemId} variant="outlined">
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                        <Box sx={{ minWidth: 0, mr: 1 }}>
                          <Typography sx={{ fontWeight: 700 }}><Link component={RouterLink} to={`/items/${row.itemId}`}>{row.name}</Link></Typography>
                          {row.demand === 0 && <Chip size="small" color="warning" label={t('pages.procurement.belowMinimumStock')} />}
                          {row.sku && (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              SKU: {row.sku}
                            </Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          <Chip
                            size="small"
                            color={row.classification === 'consumable' ? 'warning' : 'info'}
                            label={row.classification === 'consumable' ? t('pages.procurement.consumable') : t('pages.procurement.asset')}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={row.recommendedAction === 'obtain_commitment' ? t('pages.procurement.obtainCommitment') : row.recommendedAction === 'purchase' ? t('pages.procurement.purchase') : t('pages.procurement.rent')}
                          />
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                        <Chip size="small" color="info" variant="outlined" label={`${row.orderedStock ?? 0} ${t('pages.procurement.inTransit')}`} />
                        {row.recommendedAction === 'obtain_commitment'
                          ? <Button title={translate('pages.procurement.openTheItemToObtainAnAvailabilityCommitment')} size="small" component={RouterLink} to={`/items/${row.itemId}`}>{t('pages.procurement.obtainCommitment')}</Button>
                          : <Button title={translate('pages.procurement.recordAPurchaseForThisShortage')} size="small" disabled={toOrder(row) === 0} onClick={() => setOrderItem(row)}>{t('pages.procurement.recordOrder')}</Button>}
                      </Stack>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                          gap: 0.5,
                          mt: 1,
                          pt: 1,
                          borderTop: 1,
                          borderColor: 'divider',
                          textAlign: 'center',
                        }}
                      >
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('pages.procurement.demand')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.demand}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('pages.procurement.stock')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.availableStock}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('pages.procurement.rest')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
                            {row.projectedStock}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('pages.procurement.toOrder2')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 900, color: 'error.main' }}>
                          {toOrder(row)}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>SKU</TableCell>
                      <TableCell>{t('common.item')}</TableCell>
                      <TableCell>{t('common.type')}</TableCell>
                      <TableCell align="right">{t('pages.procurement.demand')}</TableCell>
                      <TableCell align="right">{t('enum.itemStatus.available')}</TableCell>
                      <TableCell align="right">{t('pages.procurement.afterDemand')}</TableCell>
                      <TableCell align="right">{t('pages.procurement.toOrder2')}</TableCell>
                      <TableCell align="right">{t('enum.value.in_transit')}</TableCell>
                      <TableCell>{t('common.action')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.itemId} hover>
                        <TableCell>{row.sku || '—'}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}><Link component={RouterLink} to={`/items/${row.itemId}`}>{row.name}</Link>{row.demand === 0 && <Chip size="small" color="warning" label={t('pages.procurement.belowMinimumStock')} sx={{ ml: 1 }} />}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={row.classification === 'consumable' ? 'warning' : 'info'}
                            label={row.classification === 'consumable' ? t('pages.procurement.consumable') : t('pages.procurement.asset')}
                          />
                        </TableCell>
                        <TableCell align="right">{row.demand}</TableCell>
                        <TableCell align="right">{row.availableStock}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: 'error.main' }}>
                          {row.projectedStock}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900, color: 'error.main' }}>
                          {toOrder(row)}
                        </TableCell>
                        <TableCell align="right">{row.orderedStock ?? 0}</TableCell>
                        <TableCell>
                          {row.recommendedAction === 'obtain_commitment'
                            ? <Button title={translate('pages.procurement.openTheItemToObtainAnAvailabilityCommitment')} size="small" component={RouterLink} to={`/items/${row.itemId}`}>{t('pages.procurement.obtainCommitment')}</Button>
                            : <Button title={translate('pages.procurement.recordAPurchaseForThisShortage')} size="small" disabled={toOrder(row) === 0} onClick={() => setOrderItem(row)}>{t('pages.procurement.order')}</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        ))}
      </Stack>
      {page.control}
      {!isPending && <OperationHistory title={t('procurement.planningDetails.demand')} count={filtered.length}><PlanningDetails rows={page.rows} eventId={eventId} /></OperationHistory>}
      {orderItem && <PurchaseDraft key={orderItem.itemId} initialLines={[shortageLine(orderItem)]} eventId={eventId} onClose={() => setOrderItem(null)} />}
    </Box>
  );
}
