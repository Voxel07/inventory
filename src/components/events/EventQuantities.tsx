import { Alert, Link, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { EventReport } from '../../types';
import { useLocalizedText } from '../../utils/naming';

export function EventQuantities({ event }: { event?: EventReport }) {
  const t = useLocalizedText();
  if (!event) return null;
  const labels: Record<string, string> = { requested: t('Angefragt', 'Requested'), prepared: t('Vorbereitet', 'Prepared'), handedOver: t('Ausgegeben', 'Handed over'), returned: t('Zurück', 'Returned'), consumed: t('Verbraucht', 'Consumed'), damaged: t('Beschädigt', 'Damaged'), missing: t('Vermisst', 'Missing'), writtenOff: t('Abgeschrieben', 'Written off'), outstanding: t('Noch ausstehend (inkl. vermisst)', 'Outstanding (includes missing)') };
  const ids = [...new Set([...Object.keys(event.plannedQuantities), ...Object.keys(event.usedQuantities), ...Object.values(event.quantities ?? {}).flatMap((values) => Object.keys(values))])];
  return <Stack spacing={2} sx={{ mb: 3 }}>
    <Alert severity="info">{t('Ausgegeben bleibt als historische Menge erhalten. Vermisst ist Teil der noch ausstehenden Rückgaben.', 'Handed-over totals remain in the event history after returns. Missing equipment is included in outstanding returns.')}</Alert>
    {!ids.length && <Typography>{t('Noch keine geplanten oder angefragten Artikel.', 'No planned or requested items yet.')}</Typography>}
    {ids.length > 0 && <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={t('Eventmengen je Artikel', 'Event quantities by item')} sx={{ '& td, & th': { px: 1, py: 0.75 }, '& tr:last-child td, & tr:last-child th': { borderBottom: 0 } }}>
        <TableHead><TableRow>
          <TableCell sx={{ minWidth: 180 }}>{t('Artikel', 'Item')}</TableCell>
          <TableCell align="right">{t('Geplant', 'Planned')}</TableCell>
          {Object.entries(labels).map(([key, label]) => <TableCell key={key} align="right" sx={{ maxWidth: 150 }}>{label}</TableCell>)}
        </TableRow></TableHead>
        <TableBody>{ids.map((id) => <TableRow key={id} hover>
          <TableCell component="th" scope="row">
            <Link component={RouterLink} to={`/items/${id}`} color="text.primary" underline="hover" sx={{ fontWeight: 600 }}>{event.itemNames?.[id] ?? id}</Link>
          </TableCell>
          <TableCell align="right">{event.plannedQuantities[id] ?? 0}</TableCell>
          {Object.keys(labels).map((key) => {
            const quantity = event.quantities?.[key]?.[id] ?? (key === 'handedOver' ? event.usedQuantities[id] ?? 0 : 0);
            return <TableCell key={key} align="right" sx={key === 'outstanding' && quantity > 0 ? { color: 'warning.main', fontWeight: 700 } : undefined}>{quantity}</TableCell>;
          })}
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>}
  </Stack>;
}
