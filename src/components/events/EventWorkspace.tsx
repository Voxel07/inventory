import { Alert, Autocomplete, Box, Paper, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Button } from '../shared/ActionButtons';
import { QueryFeedback } from '../common/QueryFeedback';
import { useT } from '../../utils/naming';
import { formatDate } from '../../utils/dateFormat';
import type { useEventWorkspace } from '../../hooks/useEventWorkspace';

export function EventWorkspace({ workspace, page }: {
  workspace: ReturnType<typeof useEventWorkspace>;
  page: 'attendees' | 'timeline';
}) {
  const t = useT();
  const { event, reports, selectEvent, query, requestedId } = workspace;
  return <Box sx={{ mb: 3 }}>
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <Autocomplete fullWidth disableClearable={Boolean(event)} options={reports} value={event ?? null}
          disabled={query.isLoading || !reports.length} sx={{ maxWidth: { md: 520 } }}
          getOptionKey={(report) => report.id}
          getOptionLabel={(report) => `${report.name} · ${report.eventType} · ${formatDate(report.startDate)}`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_, report) => { if (report) selectEvent(report.id); }}
          noOptionsText={t('events.eventWorkspace.noMatchingEvents')}
          renderInput={(params) => <TextField {...params} label={t('events.eventWorkspace.selectEvent')}
            placeholder={t('events.eventWorkspace.searchEvents')} />} />
        {event && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button component={RouterLink} to={`/events/${event.id}`}>{t('common.eventPlanning')}</Button>
          <Button component={RouterLink} to={`/events/${page === 'attendees' ? 'timeline' : 'attendees'}?eventId=${event.id}`}>
            {page === 'attendees' ? t('events.eventWorkspace.openTimeline') : t('events.eventWorkspace.openAttendees')}
          </Button>
        </Stack>}
      </Stack>
      {event && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
        {formatDate(event.startDate)} – {formatDate(event.endDate)} · {t('events.eventWorkspace.allTimesAreLocalToTheEvent')}
      </Typography>}
    </Paper>
    <QueryFeedback isLoading={query.isLoading} error={query.error} />
    {!query.isLoading && !query.error && !event && <Alert severity={requestedId && reports.length ? 'warning' : 'info'} sx={{ mt: 2 }}>
      {requestedId && reports.length ? t('events.eventWorkspace.eventNotFoundPleaseSelectAnEvent')
        : t('events.eventWorkspace.createAnEventInEventPlanningFirst')}
      <Button component={RouterLink} to="/events" sx={{ ml: 1 }}>{t('common.eventPlanning')}</Button>
    </Alert>}
  </Box>;
}
