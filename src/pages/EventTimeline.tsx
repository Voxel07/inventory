import { Box } from '@mui/material';
import { PageHeader } from '../components/shared/PageHeader';
import { EventWorkspace } from '../components/events/EventWorkspace';
import { TimelineSchedule } from '../components/events/EventTimelineSchedule';
import { useEventWorkspace } from '../hooks/useEventWorkspace';
import { useT } from '../utils/naming';

export function EventTimeline() {
  const t = useT();
  const workspace = useEventWorkspace();
  return <Box>
    <PageHeader title={t('common.eventTimeline')} description={t('pages.eventTimeline.gameActionsAndEventPreparationAtAGlanceTwoSchedules')} />
    <EventWorkspace workspace={workspace} page="timeline" />
    {workspace.event && !workspace.query.error && <TimelineSchedule key={workspace.event.id} eventId={workspace.event.id} startDate={workspace.event.startDate} endDate={workspace.event.endDate} />}
  </Box>;
}
