import { useState } from 'react';
import { Alert, Box, Checkbox, Chip, FormControlLabel, InputAdornment, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import SearchIcon from '@mui/icons-material/Search';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import { Button, IconButton } from '../components/shared/ActionButtons';
import { PageHeader } from '../components/shared/PageHeader';
import { FormDialog, DialogForm } from '../components/shared/FormDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { QueryFeedback } from '../components/common/QueryFeedback';
import { EventMetric, EventWorkspace } from '../components/events/EventWorkspace';
import { attendeeHooks } from '../hooks/useEventLogistics';
import { useEventWorkspace } from '../hooks/useEventWorkspace';
import { useAuth } from '../hooks/useAuth';
import { canAccessProcurement } from '../utils/access';
import { useLocalizedText } from '../utils/naming';
import { formatDateTime } from '../utils/dateFormat';
import { useUIStore } from '../store/uiStore';
import type { EventAttendee, EventAttendeeInput } from '../types/eventLogistics';

export function EventAttendees() {
  const t = useLocalizedText();
  const workspace = useEventWorkspace();
  return <Box>
    <PageHeader title={t('Eventteilnehmer', 'Event attendees')} description={t(
      'Wer kommt, wann die Personen an- und abreisen und welche Essensmarken benötigt werden.',
      'Who is attending, when they arrive and leave, and the food stamps they need.',
    )} />
    <EventWorkspace workspace={workspace} page="attendees" />
    {workspace.event && !workspace.query.error && <AttendeeList key={workspace.event.id} eventId={workspace.event.id} />}
  </Box>;
}

function AttendeeList({ eventId }: { eventId: string }) {
  const t = useLocalizedText();
  const { user } = useAuth();
  const canEdit = canAccessProcurement(user);
  const query = attendeeHooks.useList(eventId);
  const save = attendeeHooks.useSave(eventId);
  const remove = attendeeHooks.useDelete(eventId);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EventAttendee | 'new' | null>(null);
  const [deleting, setDeleting] = useState<EventAttendee | null>(null);
  const attendees = query.data ?? [];
  const unissued = attendees.filter((attendee) => !attendee.foodStampsIssued);
  const missingDates = attendees.filter((attendee) => !attendee.arrivesAt || !attendee.leavesAt).length;
  const term = search.trim().toLocaleLowerCase();
  const visible = attendees.filter((attendee) => `${attendee.name} ${attendee.role} ${attendee.notes ?? ''}`.toLocaleLowerCase().includes(term));
  const totalMain = attendees.reduce((sum, attendee) => sum + attendee.mainMealStamps, 0);
  const totalBreakfast = attendees.reduce((sum, attendee) => sum + attendee.breakfastStamps, 0);
  const ready = !query.isLoading && !query.error;

  function submit(data: EventAttendeeInput) {
    save.mutate({ id: editing && editing !== 'new' ? editing.id : undefined, data }, {
      onSuccess: () => {
        setEditing(null);
        showSnackbar(t('Teilnehmer gespeichert', 'Attendee saved'), 'success');
      },
    });
  }

  return <>
    <QueryFeedback isLoading={query.isLoading} error={query.error} />
    {ready && <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mb: 3 }}>
        <EventMetric label={t('Teilnehmer', 'Attendees')} value={attendees.length} detail={t(`${missingDates} mit offenen Reisezeiten`, `${missingDates} with travel times to confirm`)} />
        <EventMetric label={t('Hauptmahlzeit-Marken', 'Main-meal stamps')} value={totalMain} detail={t('4 pro Person', '4 per person')} />
        <EventMetric label={t('Frühstücksmarken', 'Breakfast stamps')} value={totalBreakfast} detail={t('1 pro Person', '1 per person')} />
        <EventMetric label={t('Noch auszugeben', 'Still to issue')} value={unissued.reduce((sum, attendee) => sum + attendee.mainMealStamps + attendee.breakfastStamps, 0)}
          detail={t(`Für ${unissued.length} Personen`, `For ${unissued.length} people`)} />
      </Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
          <TextField size="small" label={t('Teilnehmer suchen', 'Search attendees')} value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Name oder Rolle', 'Name or role')} sx={{ width: { xs: '100%', sm: 320 } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => { save.reset(); setEditing('new'); }}>{t('Person hinzufügen', 'Add person')}</Button>}
        </Stack>
      </Paper>
      {!attendees.length ? <Alert severity="info">{t('Noch keine Teilnehmer. Füge die ersten Personen hinzu, um Reisezeiten und Verpflegung zu planen.', 'No attendees yet. Add the first people to plan travel times and catering.')}</Alert>
        : <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t(`${visible.length} von ${attendees.length} Personen`, `${visible.length} of ${attendees.length} people`)}</Typography>
          <TableContainer component={Paper}>
            <Table size="small" sx={{ minWidth: 820 }} aria-label={t('Teilnehmer und Verpflegung', 'Attendees and catering')}>
              <TableHead><TableRow>
                <TableCell>{t('Person / Rolle', 'Person / role')}</TableCell>
                <TableCell>{t('Anreise', 'Arrival')}</TableCell><TableCell>{t('Abreise', 'Departure')}</TableCell>
                <TableCell>{t('Essensmarken', 'Food stamps')}</TableCell><TableCell>{t('Ausgabe', 'Issued')}</TableCell>
                {canEdit && <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>}
              </TableRow></TableHead>
              <TableBody>
                {visible.map((attendee) => <TableRow key={attendee.id} hover>
                  <TableCell sx={{ maxWidth: 280, overflowWrap: 'anywhere' }}>
                    <Typography sx={{ fontWeight: 600 }}>{attendee.name}</Typography><Chip size="small" label={attendee.role} sx={{ mt: 0.5, maxWidth: '100%' }} />
                    {attendee.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{attendee.notes}</Typography>}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{attendee.arrivesAt ? formatDateTime(attendee.arrivesAt) : <Chip size="small" variant="outlined" label={t('Offen', 'To confirm')} />}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{attendee.leavesAt ? formatDateTime(attendee.leavesAt) : <Chip size="small" variant="outlined" label={t('Offen', 'To confirm')} />}</TableCell>
                  <TableCell><Typography variant="body2">{t(`${attendee.mainMealStamps} Hauptmahlzeiten`, `${attendee.mainMealStamps} main meals`)}</Typography><Typography variant="body2" color="text.secondary">{t(`${attendee.breakfastStamps} Frühstück`, `${attendee.breakfastStamps} breakfast`)}</Typography></TableCell>
                  <TableCell><Chip size="small" color={attendee.foodStampsIssued ? 'success' : 'warning'} variant="outlined" label={attendee.foodStampsIssued ? t('Ausgegeben', 'Issued') : t('Benötigt', 'Needed')} /></TableCell>
                  {canEdit && <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton title={t(`${attendee.name} bearbeiten`, `Edit ${attendee.name}`)} onClick={() => { save.reset(); setEditing(attendee); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton title={t(`${attendee.name} entfernen`, `Remove ${attendee.name}`)} onClick={() => setDeleting(attendee)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </TableCell>}
                </TableRow>)}
                {!visible.length && <TableRow><TableCell colSpan={canEdit ? 6 : 5}>{t('Keine passenden Teilnehmer.', 'No matching attendees.')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </>}
    </>}
    <FormDialog open={editing !== null} onClose={() => { if (!save.isPending) setEditing(null); }}>
      {editing && <AttendeeForm attendee={editing === 'new' ? undefined : editing} pending={save.isPending} error={save.error?.message}
        onSubmit={submit} onCancel={() => setEditing(null)} />}
    </FormDialog>
    <ConfirmDialog open={Boolean(deleting)} title={t('Teilnehmer entfernen', 'Remove attendee')}
      message={t(`${deleting?.name ?? ''} aus diesem Event entfernen? Die Essensmarken-Summen werden angepasst.`, `Remove ${deleting?.name ?? ''} from this event? Food-stamp totals will be updated.`)}
      actionLabel={t('Entfernen', 'Remove')} actionColor="error" pending={remove.isPending} onClose={() => { if (!remove.isPending) setDeleting(null); }}
      onConfirm={() => { if (deleting) remove.mutate(deleting.id, {
        onSuccess: () => { setDeleting(null); showSnackbar(t('Teilnehmer entfernt', 'Attendee removed'), 'success'); },
        onError: (error) => showSnackbar(error.message, 'error'),
      }); }} />
  </>;
}

function AttendeeForm({ attendee, pending, error, onSubmit, onCancel }: {
  attendee?: EventAttendee; pending: boolean; error?: string;
  onSubmit: (data: EventAttendeeInput) => void; onCancel: () => void;
}) {
  const t = useLocalizedText();
  const [name, setName] = useState(attendee?.name ?? '');
  const [role, setRole] = useState(attendee?.role ?? '');
  const [arrivesAt, setArrivesAt] = useState(attendee?.arrivesAt?.slice(0, 16) ?? '');
  const [leavesAt, setLeavesAt] = useState(attendee?.leavesAt?.slice(0, 16) ?? '');
  const [foodStampsIssued, setFoodStampsIssued] = useState(attendee?.foodStampsIssued ?? false);
  const [notes, setNotes] = useState(attendee?.notes ?? '');
  const invalidRange = Boolean(arrivesAt && leavesAt && leavesAt < arrivesAt);
  return <DialogForm title={attendee ? t('Teilnehmer bearbeiten', 'Edit attendee') : t('Person hinzufügen', 'Add person')}
    pending={pending} error={error} onCancel={onCancel} submitDisabled={!name.trim() || !role.trim() || invalidRange}
    onSubmit={() => onSubmit({ name: name.trim(), role: role.trim(), arrivesAt: arrivesAt || null, leavesAt: leavesAt || null, foodStampsIssued, notes: notes.trim() })}>
    <Stack spacing={2}>
      <TextField autoFocus required fullWidth label={t('Name', 'Name')} value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 255 } }} />
      <TextField required fullWidth label={t('Rolle am Event', 'Role at the event')} value={role} onChange={(e) => setRole(e.target.value)}
        placeholder={t('z. B. Aufbau, Spielleitung, Küche', 'e.g. Setup crew, game master, kitchen')} slotProps={{ htmlInput: { maxLength: 255 } }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth type="datetime-local" label={t('Anreise', 'Arrival')} value={arrivesAt} onChange={(e) => setArrivesAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField fullWidth type="datetime-local" label={t('Abreise', 'Departure')} value={leavesAt} onChange={(e) => setLeavesAt(e.target.value)} error={invalidRange}
          helperText={invalidRange ? t('Abreise muss nach der Anreise liegen.', 'Departure must be at or after arrival.') : undefined}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: arrivesAt || undefined } }} />
      </Stack>
      <Typography variant="caption" color="text.secondary">{t('Ortszeit am Event. Unbekannte Reisezeiten können leer bleiben.', 'Local time at the event. Leave unknown travel times empty.')}</Typography>
      <Alert icon={<RestaurantOutlinedIcon />} severity="info">{t('Pro Person: 4 Hauptmahlzeit-Marken + 1 Frühstücksmarke.', 'Per person: 4 main-meal stamps + 1 breakfast stamp.')}</Alert>
      <FormControlLabel control={<Checkbox checked={foodStampsIssued} onChange={(e) => setFoodStampsIssued(e.target.checked)} />} label={t('Essensmarken bereits ausgegeben', 'Food stamps already issued')} />
      <TextField fullWidth multiline minRows={2} label={t('Anmerkungen', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
    </Stack>
  </DialogForm>;
}
