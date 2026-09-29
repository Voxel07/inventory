import { Alert, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
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
    {ids.map((id) => <Card key={id}><CardContent><Stack spacing={1}>
      <Typography variant="h6" component={Link} to={`/items/${id}`}>{event.itemNames?.[id] ?? id}</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}><Chip label={`${t('Geplant', 'Planned')}: ${event.plannedQuantities[id] ?? 0}`} />
        {Object.entries(labels).map(([key, label]) => <Chip key={key} color={key === 'outstanding' && (event.quantities?.[key]?.[id] ?? 0) > 0 ? 'warning' : 'default'} label={`${label}: ${event.quantities?.[key]?.[id] ?? (key === 'handedOver' ? event.usedQuantities[id] ?? 0 : 0)}`} />)}
      </Stack>
    </Stack></CardContent></Card>)}
  </Stack>;
}
