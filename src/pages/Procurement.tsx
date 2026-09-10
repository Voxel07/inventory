import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
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
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CategoryIcon from '@mui/icons-material/Category';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { jsPDF } from 'jspdf';
import { getProcurementDeficits } from '../services/procurementService';
import { useEventReports } from '../hooks/useEvents';
import { useAppLanguage, useLocalizedText } from '../utils/naming';

export function Procurement() {
  const t = useLocalizedText();
  const language = useAppLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [eventId, setEventId] = useState('');
  const { data: events = [] } = useEventReports();
  const { data: deficits = [], isLoading, error } = useQuery({
    queryKey: ['procurement-deficits', eventId],
    queryFn: () => getProcurementDeficits(eventId || undefined),
  });

  const groups = useMemo(() => {
    const result = new Map<string, typeof deficits>();
    for (const row of deficits) {
      result.set(row.supplier || 'Unassigned', [...(result.get(row.supplier || 'Unassigned') || []), row]);
    }
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [deficits]);

  // KPI Calculations
  const totalDeficitUnits = useMemo(
    () => deficits.reduce((sum, row) => sum + row.netDeficit, 0),
    [deficits]
  );
  const consumableDeficitUnits = useMemo(
    () => deficits.filter((r) => r.classification === 'consumable').reduce((sum, r) => sum + r.netDeficit, 0),
    [deficits]
  );
  const assetDeficitUnits = useMemo(
    () => deficits.filter((r) => r.classification !== 'consumable').reduce((sum, r) => sum + r.netDeficit, 0),
    [deficits]
  );

  function renderKpiValue(value: number, color?: string) {
    if (isLoading) {
      return <Skeleton variant="text" width={60} height={32} />;
    }
    if (error) {
      return <Typography variant="h5" color="text.secondary">—</Typography>;
    }
    return (
      <Typography variant="h5" sx={{ fontWeight: 800, color }}>
        {value}
      </Typography>
    );
  }

  function exportCsv() {
    const header = ['supplier', 'sku', 'name', 'classification', 'demand', 'available', 'projected', 'deficit', 'action'];
    const rows = deficits.map((row) => [
      row.supplier,
      row.sku,
      row.name,
      row.classification,
      row.demand,
      row.availableStock,
      row.projectedStock,
      row.netDeficit,
      row.recommendedAction,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `procurement-${eventId || 'all-events'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const selectedEvent = events.find((e) => e.id === eventId);
    const scopeLabel = selectedEvent
      ? `${selectedEvent.eventType} (${new Date(selectedEvent.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')})`
      : t('Alle geplanten Events', 'All planned events');

    let y = 18;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(t('Beschaffungsliste / Fehlmengen', 'Procurement / Shortage List'), 14, y);
    y += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${t('Umfang', 'Scope')}: ${scopeLabel} · ${t('Stand', 'Date')}: ${new Date().toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}`,
      14,
      y
    );
    y += 5;
    doc.text(
      `${t('Gesamte Fehlmenge', 'Total deficit')}: ${totalDeficitUnits} ${t('Einheiten', 'units')} · ${groups.length} ${t('Lieferanten', 'suppliers')}`,
      14,
      y
    );
    y += 8;

    for (const [supplier, rows] of groups) {
      if (y > 260) {
        doc.addPage();
        y = 18;
      }

      doc.setFillColor(240, 240, 240);
      doc.rect(14, y - 4, 182, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      const supplierDeficit = rows.reduce((sum, r) => sum + r.netDeficit, 0);
      doc.text(`${supplier} (${supplierDeficit} ${t('Einheiten', 'units')})`, 16, y + 1);
      y += 6;

      // Table headers
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(t('SKU', 'SKU'), 14, y + 3);
      doc.text(t('Artikelname', 'Item name'), 40, y + 3);
      doc.text(t('Typ', 'Type'), 105, y + 3);
      doc.text(t('Bedarf', 'Demand'), 130, y + 3);
      doc.text(t('Bestand', 'Stock'), 148, y + 3);
      doc.text(t('Fehlmenge', 'Deficit'), 168, y + 3);
      doc.text(t('Aktion', 'Action'), 184, y + 3);
      y += 6;

      doc.setFont('helvetica', 'normal');
      for (const row of rows) {
        if (y > 275) {
          doc.addPage();
          y = 18;
        }
        doc.text(row.sku || '—', 14, y + 2);
        doc.text(doc.splitTextToSize(row.name, 62), 40, y + 2);
        doc.text(row.classification === 'consumable' ? t('Verbrauch', 'Consumable') : 'Asset', 105, y + 2);
        doc.text(String(row.demand), 130, y + 2);
        doc.text(String(row.availableStock), 148, y + 2);
        doc.setFont('helvetica', 'bold');
        doc.text(String(row.netDeficit), 168, y + 2);
        doc.setFont('helvetica', 'normal');
        doc.text(row.recommendedAction === 'purchase' ? t('Kaufen', 'Buy') : t('Mieten', 'Rent'), 184, y + 2);
        y += 6;
      }
      y += 4;
    }

    doc.save(`beschaffung-${eventId || 'alle-events'}.pdf`);
  }

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ mb: 3, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Typography variant="h4">{t('Beschaffung & Fehlmengen', 'Procurement & shortages')}</Typography>
          <Typography color="text.secondary">
            {t('Aktiver Bedarf minus verfügbarer Bestand, nach Lieferant gruppiert.', 'Active demand minus available stock, grouped by supplier.')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} disabled={!deficits.length} onClick={exportCsv}>
            {t('CSV', 'CSV')}
          </Button>
          <Button variant="contained" startIcon={<PrintIcon />} disabled={!deficits.length} onClick={exportPdf}>
            {t('Bestellschein PDF', 'Purchase order PDF')}
          </Button>
        </Stack>
      </Stack>

      {/* KPI Cards */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1.5,
          mb: 3,
        }}
      >
        <Paper sx={{ p: 2, borderLeft: 4, borderColor: 'error.main' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
            <WarningAmberIcon color="error" fontSize="small" />
            <Typography variant="caption" color="text.secondary">
              {t('Gesamte Fehlmenge', 'Total deficit')}
            </Typography>
          </Stack>
          {renderKpiValue(totalDeficitUnits, 'error.main')}
          <Typography variant="caption" color="text.secondary">
            {t('Fehlende Einheiten', 'Missing units')}
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, borderLeft: 4, borderColor: 'warning.main' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
            <CategoryIcon color="warning" fontSize="small" />
            <Typography variant="caption" color="text.secondary">
              {t('Verbrauchsmaterial', 'Consumables')}
            </Typography>
          </Stack>
          {renderKpiValue(consumableDeficitUnits)}
          <Typography variant="caption" color="text.secondary">
            {t('Nachzukaufen', 'To purchase')}
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, borderLeft: 4, borderColor: 'info.main' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
            <ShoppingCartIcon color="info" fontSize="small" />
            <Typography variant="caption" color="text.secondary">
              {t('Anlagen / Assets', 'Assets & gear')}
            </Typography>
          </Stack>
          {renderKpiValue(assetDeficitUnits)}
          <Typography variant="caption" color="text.secondary">
            {t('Zu mieten oder kaufen', 'To rent or buy')}
          </Typography>
        </Paper>

        <Paper sx={{ p: 2, borderLeft: 4, borderColor: 'primary.main' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
            <LocalShippingIcon color="primary" fontSize="small" />
            <Typography variant="caption" color="text.secondary">
              {t('Lieferanten', 'Suppliers')}
            </Typography>
          </Stack>
          {renderKpiValue(groups.length)}
          <Typography variant="caption" color="text.secondary">
            {t('Betroffene Bezugsquellen', 'Affected sources')}
          </Typography>
        </Paper>
      </Box>

      <FormControl sx={{ minWidth: 260, mb: 3 }}>
        <InputLabel>{t('Event-Umfang', 'Event scope')}</InputLabel>
        <Select value={eventId} label={t('Event-Umfang', 'Event scope')} onChange={(event) => setEventId(event.target.value)}>
          <MenuItem value="">{t('Alle geplanten Events', 'All planned events')}</MenuItem>
          {events.map((event) => (
            <MenuItem key={event.id} value={event.id}>
              {event.eventType} · {new Date(event.eventDate).toLocaleDateString()}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {error && (
        <Alert severity="error">
          {error instanceof Error ? error.message : t('Fehlmengen konnten nicht geladen werden.', 'Could not load deficits.')}
        </Alert>
      )}
      {!isLoading && !deficits.length && (
        <Alert severity="success">{t('Keine Fehlmengen im gewählten Umfang.', 'No shortages in the selected scope.')}</Alert>
      )}

      <Stack spacing={2}>
        {groups.map(([supplier, rows]) => (
          <Paper key={supplier}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <ShoppingCartIcon color="primary" />
              <Typography variant="h6">{supplier}</Typography>
              <Chip
                size="small"
                color="error"
                variant="outlined"
                label={`${rows.reduce((sum, row) => sum + row.netDeficit, 0)} ${t('Einheiten fehlend', 'units deficit')}`}
              />
            </Stack>

            {isMobile ? (
              <Stack spacing={1} sx={{ p: 1.5 }}>
                {rows.map((row) => (
                  <Card key={row.itemId} variant="outlined">
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                        <Box sx={{ minWidth: 0, mr: 1 }}>
                          <Typography sx={{ fontWeight: 700 }}>{row.name}</Typography>
                          {row.sku && (
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                              SKU: {row.sku}
                            </Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          <Chip
                            size="small"
                            color={row.classification === 'consumable' ? 'warning' : 'info'}
                            label={row.classification === 'consumable' ? t('Verbrauch', 'Consumable') : t('Asset', 'Asset')}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={row.recommendedAction === 'purchase' ? t('Kaufen', 'Purchase') : t('Mieten', 'Rent')}
                          />
                        </Stack>
                      </Box>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
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
                            {t('Bedarf', 'Demand')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.demand}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('Lager', 'Stock')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.availableStock}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('Rest', 'Rest')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
                            {row.projectedStock}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            {t('Fehlmenge', 'Deficit')}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 900, color: 'error.main' }}>
                            {row.netDeficit}
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
                      <TableCell>{t('Artikel', 'Item')}</TableCell>
                      <TableCell>{t('Typ', 'Type')}</TableCell>
                      <TableCell align="right">{t('Bedarf', 'Demand')}</TableCell>
                      <TableCell align="right">{t('Verfügbar', 'Available')}</TableCell>
                      <TableCell align="right">{t('Nach Bedarf', 'After demand')}</TableCell>
                      <TableCell align="right">{t('Zu bestellen', 'To order')}</TableCell>
                      <TableCell>{t('Aktion', 'Action')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.itemId} hover>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{row.sku || '—'}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={row.classification === 'consumable' ? 'warning' : 'info'}
                            label={row.classification === 'consumable' ? t('Verbrauch', 'Consumable') : t('Asset', 'Asset')}
                          />
                        </TableCell>
                        <TableCell align="right">{row.demand}</TableCell>
                        <TableCell align="right">{row.availableStock}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: 'error.main' }}>
                          {row.projectedStock}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900, color: 'error.main' }}>
                          {row.netDeficit}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={row.recommendedAction === 'purchase' ? t('Kaufen', 'Purchase') : t('Mieten / kaufen', 'Rent / purchase')}
                          />
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
    </Box>
  );
}
