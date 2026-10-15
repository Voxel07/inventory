import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Chip, MenuItem, Paper, Stack, Tabs, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SportsEsportsOutlinedIcon from '@mui/icons-material/SportsEsportsOutlined';
import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import { Button, IconButton, Tab } from '../components/shared/ActionButtons';
import { PageHeader } from '../components/shared/PageHeader';
import { FormDialog, DialogForm } from '../components/shared/FormDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { QueryFeedback } from '../components/common/QueryFeedback';
import { EventMetric, EventWorkspace } from '../components/events/EventWorkspace';
import { timelineHooks } from '../hooks/useEventLogistics';
import { useEventWorkspace } from '../hooks/useEventWorkspace';
import { useAuth } from '../hooks/useAuth';
import { canEditEvents } from '../utils/access';
import { useT } from '../utils/naming';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { useUIStore } from '../store/uiStore';
import type { EventTimelineEntry, EventTimelineInput, TimelineCategory, TimelineStatus } from '../types/eventLogistics';

const statusColors = { planned: 'default', in_progress: 'info', completed: 'success' } as const;

function useStatusLabels(): Record<TimelineStatus, string> {
  const t = useT();
  return { planned: t('common.planned'), in_progress: t('pages.eventTimeline.inProgress'), completed: t('common.completed') };
}

export function EventTimeline() {
  const t = useT();
  const workspace = useEventWorkspace();
  return <Box>
    <PageHeader title={t('common.eventTimeline')} description={t('pages.eventTimeline.gameActionsAndEventPreparationAtAGlanceTwoSchedules')} />
    <EventWorkspace workspace={workspace} page="timeline" />
    {workspace.event && !workspace.query.error && <TimelineSchedule key={workspace.event.id} eventId={workspace.event.id} startDate={workspace.event.startDate} />}
  </Box>;
}

function TimelineSchedule({ eventId, startDate }: { eventId: string; startDate: string }) {
  const t = useT();
  const statusLabels = useStatusLabels();
  const { user } = useAuth();
  const canEdit = canEditEvents(user);
  const query = timelineHooks.useList(eventId);
  const save = timelineHooks.useSave(eventId);
  const remove = timelineHooks.useDelete(eventId);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [params, setParams] = useSearchParams();
  const category: TimelineCategory = params.get('tab') === 'preparation' ? 'preparation' : 'in_game';
  const [editing, setEditing] = useState<EventTimelineEntry | 'new' | null>(null);
  const [deleting, setDeleting] = useState<EventTimelineEntry | null>(null);
  const entries = query.data ?? [];
  const schedule = entries.filter((entry) => entry.category === category)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.title.localeCompare(right.title));
  const days = [...new Set(schedule.map((entry) => entry.startsAt.slice(0, 10)))];
  const completed = schedule.filter((entry) => entry.status === 'completed').length;
  const ready = !query.isLoading && !query.error;
  const lastEnd = schedule.reduce((latest, entry) => (entry.endsAt ?? entry.startsAt) > latest ? (entry.endsAt ?? entry.startsAt) : latest, '');

  function changeCategory(value: TimelineCategory) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('eventId', eventId);
      next.set('tab', value);
      return next;
    });
  }

  function submit(data: EventTimelineInput) {
    save.mutate({ id: editing && editing !== 'new' ? editing.id : undefined, data }, {
      onSuccess: () => {
        setEditing(null);
        showSnackbar(t('pages.eventTimeline.timelineEntrySaved'), 'success');
      },
    });
  }

  return <>
    <Paper sx={{ mb: 3 }}>
      <Tabs value={category} onChange={(_, value: TimelineCategory) => changeCategory(value)} variant="scrollable" scrollButtons="auto" aria-label={t('pages.eventTimeline.eventSchedules')}>
        <Tab value="in_game" id="timeline-tab-in_game" aria-controls="timeline-panel-in_game" icon={<SportsEsportsOutlinedIcon />} iconPosition="start"
          label={t('pages.eventTimeline.inGameValueCount', { valueCount: String(entries.filter((entry) => entry.category === 'in_game').length) })} />
        <Tab value="preparation" id="timeline-tab-preparation" aria-controls="timeline-panel-preparation" icon={<ConstructionOutlinedIcon />} iconPosition="start"
          label={t('pages.eventTimeline.setupPreparationValueCount', { valueCount: String(entries.filter((entry) => entry.category === 'preparation').length) })} />
      </Tabs>
    </Paper>
    <Box role="tabpanel" id={`timeline-panel-${category}`} aria-labelledby={`timeline-tab-${category}`}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box>
          <Typography variant="h5" component="h2">{category === 'in_game' ? t('pages.eventTimeline.whatHappensInGame') : t('pages.eventTimeline.gettingTheEventReady')}</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>{category === 'in_game'
            ? t('pages.eventTimeline.briefingsMissionsAndPlannedGameActionsInChronologicalOrder')
            : t('pages.eventTimeline.setupPreparationAndTeardownIncludingBeforeAndAfterTheEvent')}</Typography>
        </Box>
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} disabled={!ready}
          onClick={() => { save.reset(); setEditing('new'); }}>{category === 'in_game' ? t('pages.eventTimeline.addAction') : t('pages.eventTimeline.addTask')}</Button>}
      </Stack>
      <QueryFeedback isLoading={query.isLoading} error={query.error} />
      {ready && <>
        {!!schedule.length && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mb: 3 }}>
          <EventMetric label={t('pages.eventTimeline.scheduledEntries')} value={schedule.length} detail={t('pages.eventTimeline.acrossDayCountDays', { dayCount: String(days.length) })} />
          <EventMetric label={t('pages.eventTimeline.progress')} value={`${completed} / ${schedule.length}`} detail={t('pages.eventTimeline.entriesCompleted')} />
          <EventMetric label={t('pages.eventTimeline.firstScheduledDay')} value={formatDate(schedule[0].startsAt)} detail={t('pages.eventTimeline.throughLastEnd', { lastEnd: String(formatDate(lastEnd)) })} />
        </Box>}
        {!schedule.length ? <Paper sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center', borderStyle: 'dashed' }}>
          {category === 'in_game' ? <SportsEsportsOutlinedIcon sx={{ fontSize: 42, color: 'primary.main', mb: 1 }} /> : <ConstructionOutlinedIcon sx={{ fontSize: 42, color: 'primary.main', mb: 1 }} />}
          <Typography variant="h6" component="h3">{category === 'in_game' ? t('pages.eventTimeline.startPlanningTheGame') : t('pages.eventTimeline.startPreparingTheEvent')}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>{category === 'in_game'
            ? t('pages.eventTimeline.scheduleTheFirstActionWithATimeLocationAndResponsible')
            : t('pages.eventTimeline.planWhenEachPartOfTheEventWillBeBuilt')}</Typography>
        </Paper> : days.map((day) => <Box component="section" key={day} aria-label={formatDate(day)} sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1.5} sx={{ mb: 2, alignItems: 'center' }}>
            <Chip label={formatDate(day)} color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
            <Box sx={{ flex: 1, borderTop: 1, borderColor: 'divider' }} />
          </Stack>
          <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {schedule.filter((entry) => entry.startsAt.startsWith(day)).map((entry) => <Box component="li" key={entry.id}
              sx={{ display: 'grid', gridTemplateColumns: { xs: '16px minmax(0, 1fr)', sm: '92px 20px minmax(0, 1fr)' }, columnGap: { xs: 1, sm: 2 } }}>
              <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right', pt: 2 }}>
                <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{entry.startsAt.slice(11, 16)}</Typography>
                {entry.endsAt && <Typography variant="caption" color="text.secondary">{entry.endsAt.slice(0, 10) === day ? entry.endsAt.slice(11, 16) : formatDateTime(entry.endsAt)}</Typography>}
              </Box>
              <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <Box sx={{ position: 'absolute', top: 0, bottom: 0, width: 2, bgcolor: 'divider' }} />
                <Box sx={{ position: 'relative', mt: 2.4, width: 12, height: 12, borderRadius: '50%', bgcolor: entry.status === 'completed' ? 'success.main' : entry.status === 'in_progress' ? 'info.main' : 'primary.main', boxShadow: (theme) => `0 0 0 4px ${theme.palette.background.default}` }} />
              </Box>
              <Paper component="article" sx={{ p: 2, mb: 2, minWidth: 0, borderLeft: 3, borderLeftColor: entry.status === 'completed' ? 'success.main' : entry.status === 'in_progress' ? 'info.main' : 'primary.main' }}>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, mb: 0.5 }}>{entry.startsAt.slice(11, 16)}{entry.endsAt ? ` – ${entry.endsAt.slice(0, 10) === day ? entry.endsAt.slice(11, 16) : formatDateTime(entry.endsAt)}` : ''}</Typography>
                    <Typography variant="h6" component="h3" sx={{ overflowWrap: 'anywhere' }}>{entry.title}</Typography>
                  </Box>
                  {canEdit && <Stack direction="row" sx={{ flexShrink: 0 }}>
                    <IconButton size="small" title={t('pages.eventTimeline.editTitle', { title: String(entry.title) })} onClick={() => { save.reset(); setEditing(entry); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton size="small" title={t('pages.eventTimeline.removeTitle', { title: String(entry.title) })} onClick={() => setDeleting(entry)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Stack>}
                </Stack>
                <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}>
                  <Chip size="small" variant="outlined" color={statusColors[entry.status]} label={statusLabels[entry.status]} icon={entry.status === 'completed' ? <CheckCircleOutlineIcon /> : undefined} />
                  {entry.owner && <Chip size="small" variant="outlined" icon={<PersonOutlineIcon />} label={entry.owner} sx={{ maxWidth: '100%' }} />}
                  {entry.location && <Chip size="small" variant="outlined" icon={<PlaceOutlinedIcon />} label={entry.location} sx={{ maxWidth: '100%' }} />}
                </Stack>
                {entry.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.description}</Typography>}
              </Paper>
            </Box>)}
          </Box>
        </Box>)}
      </>}
    </Box>
    <FormDialog open={editing !== null} maxWidth="md" onClose={() => { if (!save.isPending) setEditing(null); }}>
      {editing && <TimelineForm entry={editing === 'new' ? undefined : editing} category={category} startDate={startDate} pending={save.isPending}
        error={save.error?.message} onSubmit={submit} onCancel={() => setEditing(null)} />}
    </FormDialog>
    <ConfirmDialog open={Boolean(deleting)} title={t('pages.eventTimeline.removeTimelineEntry')}
      message={t('pages.eventTimeline.removeTitleFromTheTimeline', { title: String(deleting?.title ?? '') })}
      actionLabel={t('common.remove')} actionColor="error" pending={remove.isPending} onClose={() => { if (!remove.isPending) setDeleting(null); }}
      onConfirm={() => { if (deleting) remove.mutate(deleting.id, {
        onSuccess: () => { setDeleting(null); showSnackbar(t('pages.eventTimeline.timelineEntryRemoved'), 'success'); },
        onError: (error) => showSnackbar(error.message, 'error'),
      }); }} />
  </>;
}

function TimelineForm({ entry, category, startDate, pending, error, onSubmit, onCancel }: {
  entry?: EventTimelineEntry; category: TimelineCategory; startDate: string; pending: boolean; error?: string;
  onSubmit: (data: EventTimelineInput) => void; onCancel: () => void;
}) {
  const t = useT();
  const statusLabels = useStatusLabels();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [startsAt, setStartsAt] = useState(entry?.startsAt.slice(0, 16) ?? `${startDate.slice(0, 10)}T09:00`);
  const [endsAt, setEndsAt] = useState(entry?.endsAt?.slice(0, 16) ?? '');
  const [owner, setOwner] = useState(entry?.owner ?? '');
  const [location, setLocation] = useState(entry?.location ?? '');
  const [status, setStatus] = useState<TimelineStatus>(entry?.status ?? 'planned');
  const [description, setDescription] = useState(entry?.description ?? '');
  const invalidRange = Boolean(startsAt && endsAt && endsAt < startsAt);
  return <DialogForm title={entry ? t('pages.eventTimeline.editTimelineEntry') : category === 'in_game' ? t('pages.eventTimeline.addGameAction') : t('pages.eventTimeline.addPreparationTask')}
    pending={pending} error={error} onCancel={onCancel} submitDisabled={!title.trim() || !startsAt || invalidRange}
    onSubmit={() => onSubmit({ category: entry?.category ?? category, title: title.trim(), startsAt, endsAt: endsAt || null, owner: owner.trim(), location: location.trim(), status, description: description.trim() })}>
    <Stack spacing={2}>
      <TextField autoFocus fullWidth required label={t('pages.eventTimeline.title')} value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={category === 'in_game' ? t('pages.eventTimeline.eGMissionBriefing') : t('pages.eventTimeline.eGSetUpRadioNetwork')}
        slotProps={{ htmlInput: { maxLength: 255 } }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth required type="datetime-local" label={t('pages.eventTimeline.start')} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField fullWidth type="datetime-local" label={t('pages.eventTimeline.endOptional')} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={invalidRange}
          helperText={invalidRange ? t('pages.eventTimeline.endMustBeAtOrAfterStart') : t('pages.eventTimeline.leaveEmptyForAPointInTimeAction')}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startsAt || undefined } }} />
      </Stack>
      <Alert severity="info">{t('pages.eventTimeline.localTimeAtTheEventPreparationAndTeardownCanFall')}</Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth label={t('pages.eventTimeline.responsiblePersonTeam')} value={owner} onChange={(e) => setOwner(e.target.value)} slotProps={{ htmlInput: { maxLength: 255 } }} />
        <TextField fullWidth label={t('pages.eventTimeline.locationEventArea')} value={location} onChange={(e) => setLocation(e.target.value)} slotProps={{ htmlInput: { maxLength: 255 } }} />
      </Stack>
      <TextField select fullWidth label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value as TimelineStatus)}>
        {(Object.keys(statusLabels) as TimelineStatus[]).map((value) => <MenuItem key={value} value={value}>{statusLabels[value]}</MenuItem>)}
      </TextField>
      <TextField fullWidth multiline minRows={3} label={t('common.description')} value={description} onChange={(e) => setDescription(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
    </Stack>
  </DialogForm>;
}
