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
import { useLocalizedText } from '../utils/naming';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { useUIStore } from '../store/uiStore';
import type { EventTimelineEntry, EventTimelineInput, TimelineCategory, TimelineStatus } from '../types/eventLogistics';

const statusColors = { planned: 'default', in_progress: 'info', completed: 'success' } as const;

function useStatusLabels(): Record<TimelineStatus, string> {
  const t = useLocalizedText();
  return { planned: t('Geplant', 'Planned'), in_progress: t('In Arbeit', 'In progress'), completed: t('Abgeschlossen', 'Completed') };
}

export function EventTimeline() {
  const t = useLocalizedText();
  const workspace = useEventWorkspace();
  return <Box>
    <PageHeader title={t('Eventzeitplan', 'Event timeline')} description={t(
      'Spielaktionen und Aufbau im Überblick — zwei Zeitpläne für ein gemeinsames Event.',
      'Game actions and event preparation at a glance — two schedules for one event.',
    )} />
    <EventWorkspace workspace={workspace} page="timeline" />
    {workspace.event && !workspace.query.error && <TimelineSchedule key={workspace.event.id} eventId={workspace.event.id} startDate={workspace.event.startDate} />}
  </Box>;
}

function TimelineSchedule({ eventId, startDate }: { eventId: string; startDate: string }) {
  const t = useLocalizedText();
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
        showSnackbar(t('Zeitplaneintrag gespeichert', 'Timeline entry saved'), 'success');
      },
    });
  }

  return <>
    <Paper sx={{ mb: 3 }}>
      <Tabs value={category} onChange={(_, value: TimelineCategory) => changeCategory(value)} variant="scrollable" scrollButtons="auto" aria-label={t('Eventzeitpläne', 'Event schedules')}>
        <Tab value="in_game" id="timeline-tab-in_game" aria-controls="timeline-panel-in_game" icon={<SportsEsportsOutlinedIcon />} iconPosition="start"
          label={t(`Im Spiel (${entries.filter((entry) => entry.category === 'in_game').length})`, `In game (${entries.filter((entry) => entry.category === 'in_game').length})`)} />
        <Tab value="preparation" id="timeline-tab-preparation" aria-controls="timeline-panel-preparation" icon={<ConstructionOutlinedIcon />} iconPosition="start"
          label={t(`Aufbau & Vorbereitung (${entries.filter((entry) => entry.category === 'preparation').length})`, `Setup & preparation (${entries.filter((entry) => entry.category === 'preparation').length})`)} />
      </Tabs>
    </Paper>
    <Box role="tabpanel" id={`timeline-panel-${category}`} aria-labelledby={`timeline-tab-${category}`}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
        <Box>
          <Typography variant="h5" component="h2">{category === 'in_game' ? t('Was passiert im Spiel?', 'What happens in game?') : t('Alles bereit für das Event', 'Getting the event ready')}</Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>{category === 'in_game'
            ? t('Briefings, Missionen und geplante Spielaktionen in zeitlicher Reihenfolge.', 'Briefings, missions and planned game actions in chronological order.')
            : t('Aufbau, Vorbereitung und Abbau — auch vor und nach den Eventtagen.', 'Setup, preparation and teardown — including before and after the event dates.')}</Typography>
        </Box>
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} disabled={!ready}
          onClick={() => { save.reset(); setEditing('new'); }}>{category === 'in_game' ? t('Aktion hinzufügen', 'Add action') : t('Aufgabe hinzufügen', 'Add task')}</Button>}
      </Stack>
      <QueryFeedback isLoading={query.isLoading} error={query.error} />
      {ready && <>
        {!!schedule.length && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mb: 3 }}>
          <EventMetric label={t('Geplante Einträge', 'Scheduled entries')} value={schedule.length} detail={t(`An ${days.length} Tagen`, `Across ${days.length} days`)} />
          <EventMetric label={t('Fortschritt', 'Progress')} value={`${completed} / ${schedule.length}`} detail={t('Einträge abgeschlossen', 'Entries completed')} />
          <EventMetric label={t('Erster Termin', 'First scheduled day')} value={formatDate(schedule[0].startsAt)} detail={t(`Bis ${formatDate(lastEnd)}`, `Through ${formatDate(lastEnd)}`)} />
        </Box>}
        {!schedule.length ? <Paper sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center', borderStyle: 'dashed' }}>
          {category === 'in_game' ? <SportsEsportsOutlinedIcon sx={{ fontSize: 42, color: 'primary.main', mb: 1 }} /> : <ConstructionOutlinedIcon sx={{ fontSize: 42, color: 'primary.main', mb: 1 }} />}
          <Typography variant="h6" component="h3">{category === 'in_game' ? t('Die Spielplanung beginnt hier', 'Start planning the game') : t('Die Eventvorbereitung beginnt hier', 'Start preparing the event')}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>{category === 'in_game'
            ? t('Plane die erste Aktion mit Uhrzeit, Ort und verantwortlicher Person.', 'Schedule the first action with a time, location and responsible person.')
            : t('Plane, wann die einzelnen Eventbereiche aufgebaut und vorbereitet werden.', 'Plan when each part of the event will be built and prepared.')}</Typography>
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
                    <IconButton size="small" title={t(`${entry.title} bearbeiten`, `Edit ${entry.title}`)} onClick={() => { save.reset(); setEditing(entry); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton size="small" title={t(`${entry.title} entfernen`, `Remove ${entry.title}`)} onClick={() => setDeleting(entry)}><DeleteOutlineIcon fontSize="small" /></IconButton>
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
    <ConfirmDialog open={Boolean(deleting)} title={t('Zeitplaneintrag entfernen', 'Remove timeline entry')}
      message={t(`„${deleting?.title ?? ''}“ aus dem Zeitplan entfernen?`, `Remove “${deleting?.title ?? ''}” from the timeline?`)}
      actionLabel={t('Entfernen', 'Remove')} actionColor="error" pending={remove.isPending} onClose={() => { if (!remove.isPending) setDeleting(null); }}
      onConfirm={() => { if (deleting) remove.mutate(deleting.id, {
        onSuccess: () => { setDeleting(null); showSnackbar(t('Zeitplaneintrag entfernt', 'Timeline entry removed'), 'success'); },
        onError: (error) => showSnackbar(error.message, 'error'),
      }); }} />
  </>;
}

function TimelineForm({ entry, category, startDate, pending, error, onSubmit, onCancel }: {
  entry?: EventTimelineEntry; category: TimelineCategory; startDate: string; pending: boolean; error?: string;
  onSubmit: (data: EventTimelineInput) => void; onCancel: () => void;
}) {
  const t = useLocalizedText();
  const statusLabels = useStatusLabels();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [startsAt, setStartsAt] = useState(entry?.startsAt.slice(0, 16) ?? `${startDate.slice(0, 10)}T09:00`);
  const [endsAt, setEndsAt] = useState(entry?.endsAt?.slice(0, 16) ?? '');
  const [owner, setOwner] = useState(entry?.owner ?? '');
  const [location, setLocation] = useState(entry?.location ?? '');
  const [status, setStatus] = useState<TimelineStatus>(entry?.status ?? 'planned');
  const [description, setDescription] = useState(entry?.description ?? '');
  const invalidRange = Boolean(startsAt && endsAt && endsAt < startsAt);
  return <DialogForm title={entry ? t('Zeitplaneintrag bearbeiten', 'Edit timeline entry') : category === 'in_game' ? t('Spielaktion hinzufügen', 'Add game action') : t('Vorbereitungsaufgabe hinzufügen', 'Add preparation task')}
    pending={pending} error={error} onCancel={onCancel} submitDisabled={!title.trim() || !startsAt || invalidRange}
    onSubmit={() => onSubmit({ category: entry?.category ?? category, title: title.trim(), startsAt, endsAt: endsAt || null, owner: owner.trim(), location: location.trim(), status, description: description.trim() })}>
    <Stack spacing={2}>
      <TextField autoFocus fullWidth required label={t('Titel', 'Title')} value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={category === 'in_game' ? t('z. B. Einsatzbesprechung', 'e.g. Mission briefing') : t('z. B. Funknetz aufbauen', 'e.g. Set up radio network')}
        slotProps={{ htmlInput: { maxLength: 255 } }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth required type="datetime-local" label={t('Beginn', 'Start')} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField fullWidth type="datetime-local" label={t('Ende (optional)', 'End (optional)')} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={invalidRange}
          helperText={invalidRange ? t('Das Ende muss nach dem Beginn liegen.', 'End must be at or after start.') : t('Ohne Endzeit als Zeitpunkt geplant.', 'Leave empty for a point-in-time action.')}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startsAt || undefined } }} />
      </Stack>
      <Alert severity="info">{t('Ortszeit am Event. Vorbereitung und Abbau dürfen vor oder nach den Eventtagen liegen.', 'Local time at the event. Preparation and teardown can fall before or after the event dates.')}</Alert>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth label={t('Verantwortliche Person / Team', 'Responsible person / team')} value={owner} onChange={(e) => setOwner(e.target.value)} slotProps={{ htmlInput: { maxLength: 255 } }} />
        <TextField fullWidth label={t('Ort / Eventbereich', 'Location / event area')} value={location} onChange={(e) => setLocation(e.target.value)} slotProps={{ htmlInput: { maxLength: 255 } }} />
      </Stack>
      <TextField select fullWidth label={t('Status', 'Status')} value={status} onChange={(e) => setStatus(e.target.value as TimelineStatus)}>
        {(Object.keys(statusLabels) as TimelineStatus[]).map((value) => <MenuItem key={value} value={value}>{statusLabels[value]}</MenuItem>)}
      </TextField>
      <TextField fullWidth multiline minRows={3} label={t('Beschreibung', 'Description')} value={description} onChange={(e) => setDescription(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
    </Stack>
  </DialogForm>;
}
