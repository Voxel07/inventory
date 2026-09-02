import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import { getProcurementDeficits } from '../services/procurementService';
import { useEventReports } from '../hooks/useEvents';
import { useTranslate } from '../utils/naming';

export function Procurement() {
  const t = useTranslate();
  const [eventId, setEventId] = useState('');
  const { data: events = [] } = useEventReports();
  const { data: deficits = [], isLoading, error } = useQuery({
    queryKey: ['procurement-deficits', eventId],
    queryFn: () => getProcurementDeficits(eventId || undefined),
  });
  const groups = useMemo(() => {
    const result = new Map<string, typeof deficits>();
    for (const row of deficits) result.set(row.supplier || 'Unassigned', [...(result.get(row.supplier || 'Unassigned') || []), row]);
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [deficits]);

  function exportCsv() {
    const header = ['supplier', 'sku', 'name', 'classification', 'demand', 'available', 'deficit', 'action'];
    const rows = deficits.map((row) => [row.supplier, row.sku, row.name, row.classification, row.demand, row.availableStock, row.netDeficit, row.recommendedAction]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `procurement-${eventId || 'all-events'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4">{t('Beschaffung & Fehlmengen', 'Procurement & shortages')}</Typography>
          <Typography color="text.secondary">{t('Aktiver Bedarf minus verfügbarer Bestand, nach Lieferant gruppiert.', 'Active demand minus available stock, grouped by supplier.')}</Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadIcon />} disabled={!deficits.length} onClick={exportCsv}>{t('CSV exportieren', 'Export CSV')}</Button>
      </Stack>
      <FormControl sx={{ minWidth: 260, mb: 3 }}>
        <InputLabel>{t('Event-Umfang', 'Event scope')}</InputLabel>
        <Select value={eventId} label={t('Event-Umfang', 'Event scope')} onChange={(event) => setEventId(event.target.value)}>
          <MenuItem value="">{t('Alle geplanten Events', 'All planned events')}</MenuItem>
          {events.map((event) => <MenuItem key={event.id} value={event.id}>{event.eventType} · {new Date(event.eventDate).toLocaleDateString()}</MenuItem>)}
        </Select>
      </FormControl>
      {error && <Alert severity="error">{error instanceof Error ? error.message : t('Fehlmengen konnten nicht geladen werden.', 'Could not load deficits.')}</Alert>}
      {!isLoading && !deficits.length && <Alert severity="success">{t('Keine Fehlmengen im gewählten Umfang.', 'No shortages in the selected scope.')}</Alert>}
      <Stack spacing={2}>
        {groups.map(([supplier, rows]) => (
          <Paper key={supplier}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <ShoppingCartIcon color="primary" /><Typography variant="h6">{supplier}</Typography>
              <Chip size="small" label={`${rows.reduce((sum, row) => sum + row.netDeficit, 0)} ${t('Einheiten', 'units')}`} />
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>SKU</TableCell><TableCell>{t('Artikel', 'Item')}</TableCell><TableCell>{t('Typ', 'Type')}</TableCell><TableCell align="right">{t('Bedarf', 'Demand')}</TableCell><TableCell align="right">{t('Verfügbar', 'Available')}</TableCell><TableCell align="right">{t('Fehlmenge', 'Deficit')}</TableCell><TableCell>{t('Aktion', 'Action')}</TableCell></TableRow></TableHead>
                <TableBody>{rows.map((row) => <TableRow key={row.itemId}><TableCell sx={{ fontFamily: 'monospace' }}>{row.sku}</TableCell><TableCell>{row.name}</TableCell><TableCell><Chip size="small" color={row.classification === 'consumable' ? 'warning' : 'info'} label={row.classification === 'consumable' ? t('Verbrauch', 'Consumable') : t('Asset', 'Asset')} /></TableCell><TableCell align="right">{row.demand}</TableCell><TableCell align="right">{row.availableStock}</TableCell><TableCell align="right" sx={{ fontWeight: 900, color: 'error.main' }}>{row.netDeficit}</TableCell><TableCell>{row.recommendedAction === 'purchase' ? t('Kaufen', 'Purchase') : t('Mieten / kaufen', 'Rent / purchase')}</TableCell></TableRow>)}</TableBody>
              </Table>
            </TableContainer>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
