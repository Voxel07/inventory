import { Alert, Box, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Button } from '../shared/ActionButtons';
import { QueryFeedback } from '../common/QueryFeedback';
import { useLocalizedText } from '../../utils/naming';
import { formatDate } from '../../utils/dateFormat';
import type { useEventWorkspace } from '../../hooks/useEventWorkspace';

export function EventWorkspace({ workspace, page }: {
  workspace: ReturnType<typeof useEventWorkspace>;
  page: 'attendees' | 'timeline';
}) {
  const t = useLocalizedText();
  const { event, reports, selectEvent, query, requestedId } = workspace;
  return <Box sx={{ mb: 3 }}>
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <TextField select fullWidth label={t('Event auswählen', 'Select event')} value={event?.id ?? ''}
          disabled={query.isLoading || !reports.length} onChange={(e) => selectEvent(e.target.value)} sx={{ maxWidth: { md: 520 } }}>
          {reports.map((report) => <MenuItem key={report.id} value={report.id}>
            {report.name} · {report.eventType} · {formatDate(report.startDate)}
          </MenuItem>)}
        </TextField>
        {event && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button component={RouterLink} to={`/events/${event.id}`}>{t('Eventplanung', 'Event planning')}</Button>
          <Button component={RouterLink} to={`/events/${page === 'attendees' ? 'timeline' : 'attendees'}?eventId=${event.id}`}>
            {page === 'attendees' ? t('Zeitplan öffnen', 'Open timeline') : t('Teilnehmer öffnen', 'Open attendees')}
          </Button>
        </Stack>}
      </Stack>
      {event && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {formatDate(event.startDate)} – {formatDate(event.endDate)} · {t('Alle Uhrzeiten sind Ortszeit am Event.', 'All times are local to the event.')}
      </Typography>}
    </Paper>
    <QueryFeedback isLoading={query.isLoading} error={query.error} />
    {!query.isLoading && !query.error && !event && <Alert severity={requestedId && reports.length ? 'warning' : 'info'} sx={{ mt: 2 }}>
      {requestedId && reports.length ? t('Event nicht gefunden. Bitte ein Event auswählen.', 'Event not found. Please select an event.')
        : t('Zuerst ein Event in der Eventplanung erstellen.', 'Create an event in Event planning first.')}
      <Button component={RouterLink} to="/events" sx={{ ml: 1 }}>{t('Eventplanung', 'Event planning')}</Button>
    </Alert>}
  </Box>;
}

export function EventMetric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <Paper sx={{ p: 2, minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="h4" component="p" sx={{ my: 0.5, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    {detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}
  </Paper>;
}
