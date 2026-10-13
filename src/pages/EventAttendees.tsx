import { useState } from 'react';
import { Alert, Autocomplete, Box, Checkbox, Chip, FormControlLabel, InputAdornment, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import SearchIcon from '@mui/icons-material/Search';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { Button, IconButton } from '../components/shared/ActionButtons';
import { PageHeader } from '../components/shared/PageHeader';
import { FormDialog, DialogForm } from '../components/shared/FormDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { QueryFeedback } from '../components/common/QueryFeedback';
import { EventMetric, EventWorkspace } from '../components/events/EventWorkspace';
import { EventPeopleDirectory } from '../components/events/EventPeopleDirectory';
import { attendeeHooks, useEventAccounts, useEventPeople } from '../hooks/useEventLogistics';
import { useEventWorkspace } from '../hooks/useEventWorkspace';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { useAuth } from '../hooks/useAuth';
import { canEditEvents } from '../utils/access';
import { useLocalizedText } from '../utils/naming';
import { formatDateTime } from '../utils/dateFormat';
import { useUIStore } from '../store/uiStore';
import { ATTENDEE_ROLES, FACTION_ROLES } from '../types/eventLogistics';
import type { AttendeeRole, AttendeeRoleKind, EventAttendee, EventAttendeeInput, EventPerson } from '../types/eventLogistics';
import type { EventType } from '../types';

function useRoleLabels(): Record<AttendeeRoleKind, string> {
  const t = useLocalizedText();
  return {
    faction_leader: t('Fraktionsleitung', 'Faction leader'),
    faction_deputy: t('Stellv. Fraktionsleitung', 'Faction deputy'),
    faction_hq_crew: t('HQ-Crew', 'HQ crew'),
    as_held: 'AS-Held',
    event_crew: t('Eventcrew', 'Event crew'),
  };
}

function roleText(role: AttendeeRole, labels: Record<AttendeeRoleKind, string>) {
  if (FACTION_ROLES.includes(role.role)) return `${labels[role.role]} · ${role.factionName ?? '—'}`;
  return role.assignment ? `${labels[role.role]}: ${role.assignment}` : labels[role.role];
}

export function EventAttendees() {
  const t = useLocalizedText();
  const workspace = useEventWorkspace();
  return <Box>
    <PageHeader title={t('Eventteilnehmer', 'Event attendees')} description={t(
      'Wer kommt, in welcher Rolle, wann die Personen an- und abreisen und welche Essensmarken benötigt werden.',
      'Who is attending in which role, when they arrive and leave, and the food stamps they need.',
    )} />
    <EventWorkspace workspace={workspace} page="attendees" />
    {workspace.event && !workspace.query.error && <AttendeeList key={workspace.event.id} eventId={workspace.event.id} eventType={workspace.event.eventType} />}
  </Box>;
}

function AttendeeList({ eventId, eventType }: { eventId: string; eventType: EventType }) {
  const t = useLocalizedText();
  const roleLabels = useRoleLabels();
  const { user } = useAuth();
  const canEdit = canEditEvents(user);
  const query = attendeeHooks.useList(eventId);
  const save = attendeeHooks.useSave(eventId);
  const remove = attendeeHooks.useDelete(eventId);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AttendeeRoleKind | ''>('');
  const [editing, setEditing] = useState<EventAttendee | 'new' | null>(null);
  const [deleting, setDeleting] = useState<EventAttendee | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [pickedPerson, setPickedPerson] = useState<EventPerson | undefined>();
  const attendees = query.data ?? [];
  const unissued = attendees.filter((attendee) => !attendee.foodStampsIssued);
  const missingDates = attendees.filter((attendee) => !attendee.arrivesAt || !attendee.leavesAt).length;
  const term = search.trim().toLocaleLowerCase();
  const visible = attendees.filter((attendee) => (!roleFilter || attendee.roles.some((role) => role.role === roleFilter))
    && [attendee.person.name, attendee.notes ?? '', ...attendee.roles.map((role) => roleText(role, roleLabels))].join(' ').toLocaleLowerCase().includes(term));
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
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField size="small" label={t('Teilnehmer suchen', 'Search attendees')} value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Name, Rolle oder Fraktion', 'Name, role or faction')} sx={{ width: { xs: '100%', sm: 300 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            <TextField select size="small" label={t('Rolle', 'Role')} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as AttendeeRoleKind | '')} sx={{ minWidth: 220 }}>
              <MenuItem value="">{t('Alle Rollen', 'All roles')}</MenuItem>
              {ATTENDEE_ROLES.map((role) => <MenuItem key={role} value={role}>{roleLabels[role]}</MenuItem>)}
            </TextField>
          </Stack>
          {canEdit && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" startIcon={<GroupsOutlinedIcon />} onClick={() => setDirectoryOpen(true)}>{t('Personenliste', 'People list')}</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { save.reset(); setPickedPerson(undefined); setEditing('new'); }}>{t('Person hinzufügen', 'Add person')}</Button>
          </Stack>}
        </Stack>
      </Paper>
      {!attendees.length ? <Alert severity="info">{t('Noch keine Teilnehmer. Füge die ersten Personen hinzu, um Rollen, Reisezeiten und Verpflegung zu planen.', 'No attendees yet. Add the first people to plan roles, travel times and catering.')}</Alert>
        : <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t(`${visible.length} von ${attendees.length} Personen`, `${visible.length} of ${attendees.length} people`)}</Typography>
          <TableContainer component={Paper}>
            <Table size="small" sx={{ minWidth: 960 }} aria-label={t('Teilnehmer und Verpflegung', 'Attendees and catering')}>
              <TableHead><TableRow>
                <TableCell>{t('Person', 'Person')}</TableCell><TableCell>{t('Rollen', 'Roles')}</TableCell>
                <TableCell>{t('Anreise', 'Arrival')}</TableCell><TableCell>{t('Abreise', 'Departure')}</TableCell>
                <TableCell>{t('Essensmarken', 'Food stamps')}</TableCell><TableCell>{t('Ausgabe', 'Issued')}</TableCell>
                {canEdit && <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>}
              </TableRow></TableHead>
              <TableBody>
                {visible.map((attendee) => <TableRow key={attendee.id} hover>
                  <TableCell sx={{ maxWidth: 260, overflowWrap: 'anywhere' }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 600 }}>{attendee.person.name}</Typography>
                      {attendee.person.userId && <AccountCircleOutlinedIcon fontSize="small" color="action" titleAccess={t(`Verknüpft mit ${attendee.person.userName}`, `Linked to ${attendee.person.userName}`)} />}
                    </Stack>
                    {attendee.notes && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{attendee.notes}</Typography>}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 300 }}>
                    <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {attendee.roles.map((role) => <Chip key={`${role.role}:${role.factionId ?? ''}`} size="small" sx={{ maxWidth: '100%' }}
                        color={FACTION_ROLES.includes(role.role) ? 'primary' : role.role === 'as_held' ? 'secondary' : 'default'}
                        variant={role.role === 'event_crew' ? 'outlined' : 'filled'} label={roleText(role, roleLabels)} />)}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{attendee.arrivesAt ? formatDateTime(attendee.arrivesAt) : <Chip size="small" variant="outlined" label={t('Offen', 'To confirm')} />}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{attendee.leavesAt ? formatDateTime(attendee.leavesAt) : <Chip size="small" variant="outlined" label={t('Offen', 'To confirm')} />}</TableCell>
                  <TableCell><Typography variant="body2">{t(`${attendee.mainMealStamps} Hauptmahlzeiten`, `${attendee.mainMealStamps} main meals`)}</Typography><Typography variant="body2" color="text.secondary">{t(`${attendee.breakfastStamps} Frühstück`, `${attendee.breakfastStamps} breakfast`)}</Typography></TableCell>
                  <TableCell><Chip size="small" color={attendee.foodStampsIssued ? 'success' : 'warning'} variant="outlined" label={attendee.foodStampsIssued ? t('Ausgegeben', 'Issued') : t('Benötigt', 'Needed')} /></TableCell>
                  {canEdit && <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton title={t(`${attendee.person.name} bearbeiten`, `Edit ${attendee.person.name}`)} onClick={() => { save.reset(); setEditing(attendee); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton title={t(`${attendee.person.name} entfernen`, `Remove ${attendee.person.name}`)} onClick={() => setDeleting(attendee)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </TableCell>}
                </TableRow>)}
                {!visible.length && <TableRow><TableCell colSpan={canEdit ? 7 : 6}>{t('Keine passenden Teilnehmer.', 'No matching attendees.')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </>}
    </>}
    <FormDialog open={editing !== null} maxWidth="md" onClose={() => { if (!save.isPending) setEditing(null); }}>
      {editing && <AttendeeForm attendee={editing === 'new' ? undefined : editing} initialPerson={pickedPerson} eventType={eventType}
        attendingPersonIds={attendees.map((attendee) => attendee.person.id)} pending={save.isPending} error={save.error?.message}
        onSubmit={submit} onCancel={() => setEditing(null)} />}
    </FormDialog>
    {canEdit && <EventPeopleDirectory open={directoryOpen} onClose={() => setDirectoryOpen(false)}
      attendingPersonIds={attendees.map((attendee) => attendee.person.id)}
      onAddToEvent={(person) => { save.reset(); setPickedPerson(person); setDirectoryOpen(false); setEditing('new'); }} />}
    <ConfirmDialog open={Boolean(deleting)} title={t('Teilnehmer entfernen', 'Remove attendee')}
      message={t(`${deleting?.person.name ?? ''} aus diesem Event entfernen? Die Person bleibt für andere Events erhalten; die Essensmarken-Summen werden angepasst.`,
        `Remove ${deleting?.person.name ?? ''} from this event? The person stays available for other events; food-stamp totals will be updated.`)}
      actionLabel={t('Entfernen', 'Remove')} actionColor="error" pending={remove.isPending} onClose={() => { if (!remove.isPending) setDeleting(null); }}
      onConfirm={() => { if (deleting) remove.mutate(deleting.id, {
        onSuccess: () => { setDeleting(null); showSnackbar(t('Teilnehmer entfernt', 'Attendee removed'), 'success'); },
        onError: (error) => showSnackbar(error.message, 'error'),
      }); }} />
  </>;
}

type RoleRow = { role: AttendeeRoleKind; factionId: string; factionName: string | null; assignment: string };

function AttendeeForm({ attendee, initialPerson, eventType, attendingPersonIds, pending, error, onSubmit, onCancel }: {
  attendee?: EventAttendee; initialPerson?: EventPerson; eventType: EventType; attendingPersonIds: string[]; pending: boolean; error?: string;
  onSubmit: (data: EventAttendeeInput) => void; onCancel: () => void;
}) {
  const t = useLocalizedText();
  const roleLabels = useRoleLabels();
  const people = useEventPeople();
  const accounts = useEventAccounts(true);
  const factions = useFactionCatalog().factionsFor(eventType);
  const [person, setPerson] = useState<EventPerson | null>(initialPerson ?? null);
  const [personName, setPersonName] = useState(attendee?.person.name ?? initialPerson?.name ?? '');
  const [userId, setUserId] = useState<string | null>(attendee?.person.userId ?? initialPerson?.userId ?? null);
  const [roles, setRoles] = useState<RoleRow[]>(attendee?.roles.map((role) => ({ ...role, factionId: role.factionId ?? '', assignment: role.assignment ?? '' }))
    ?? [{ role: 'event_crew', factionId: '', factionName: null, assignment: '' }]);
  const [arrivesAt, setArrivesAt] = useState(attendee?.arrivesAt?.slice(0, 16) ?? '');
  const [leavesAt, setLeavesAt] = useState(attendee?.leavesAt?.slice(0, 16) ?? '');
  const [foodStampsIssued, setFoodStampsIssued] = useState(attendee?.foodStampsIssued ?? false);
  const [notes, setNotes] = useState(attendee?.notes ?? '');
  const personId = attendee?.person.id ?? person?.id ?? null;
  const candidates = (people.data ?? []).filter((option) => !attendingPersonIds.includes(option.id));
  const sameName = !personId && candidates.find((option) => option.name.trim().toLocaleLowerCase() === personName.trim().toLocaleLowerCase());
  const linkable = (accounts.data ?? []).filter((account) => !account.linkedPersonId || account.linkedPersonId === personId);
  const linkedAccount = linkable.find((account) => account.id === userId)
    ?? (userId ? { id: userId, name: attendee?.person.userName ?? person?.userName ?? userId, linkedPersonId: personId } : null);
  const invalidRange = Boolean(arrivesAt && leavesAt && leavesAt < arrivesAt);
  const roleKeys = roles.map((row) => `${row.role}:${FACTION_ROLES.includes(row.role) ? row.factionId : ''}`);
  const duplicateRole = roleKeys.some((key, index) => roleKeys.indexOf(key) !== index);
  const missingFaction = roles.some((row) => FACTION_ROLES.includes(row.role) && !row.factionId);

  function updateRole(index: number, change: Partial<RoleRow>) {
    setRoles((current) => current.map((row, position) => position === index ? { ...row, ...change } : row));
  }

  function pickPerson(option: EventPerson | string | null) {
    if (option && typeof option !== 'string') {
      setPerson(option);
      setPersonName(option.name);
      setUserId(option.userId);
    }
  }

  return <DialogForm title={attendee ? t('Teilnehmer bearbeiten', 'Edit attendee') : t('Person hinzufügen', 'Add person')}
    pending={pending} error={error} onCancel={onCancel} submitDisabled={!personName.trim() || !roles.length || invalidRange || duplicateRole || missingFaction}
    onSubmit={() => onSubmit({
      personId, personName: personName.trim(), personUserId: userId,
      arrivesAt: arrivesAt || null, leavesAt: leavesAt || null, foodStampsIssued, notes: notes.trim(),
      roles: roles.map((row) => ({
        role: row.role,
        factionId: FACTION_ROLES.includes(row.role) ? row.factionId : null,
        assignment: row.role === 'event_crew' ? row.assignment.trim() || null : null,
      })),
    })}>
    <Stack spacing={2}>
      <Typography variant="subtitle2" component="h3">{t('Person', 'Person')}</Typography>
      {attendee
        ? <TextField autoFocus required fullWidth label={t('Name', 'Name')} value={personName} onChange={(e) => setPersonName(e.target.value)}
          helperText={t('Eine Namensänderung gilt für diese Person bei allen Events.', 'Renaming applies to this person at every event.')} slotProps={{ htmlInput: { maxLength: 255 } }} />
        : <Autocomplete freeSolo options={candidates} value={person} inputValue={personName} loading={people.isLoading}
          getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
          isOptionEqualToValue={(option, value) => typeof value !== 'string' && option.id === value.id}
          renderOption={(props, option) => <li {...props} key={option.id}>
            <Box><Typography>{option.name}</Typography><Typography variant="caption" color="text.secondary">
              {t(`${option.attendances} Events`, `${option.attendances} events`)}{option.userName ? ` · ${option.userName}` : ''}
            </Typography></Box>
          </li>}
          onChange={(_, option) => pickPerson(option)}
          onInputChange={(_, value, reason) => {
            setPersonName(value);
            if (reason === 'input' || reason === 'clear') { setPerson(null); setUserId(null); }
          }}
          renderInput={(params) => <TextField {...params} autoFocus required label={t('Name', 'Name')}
            slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, maxLength: 255 } }}
            helperText={person ? t(`Bekannte Person · ${person.attendances} Events`, `Known person · ${person.attendances} events`)
              : personName.trim() ? t('Kein Treffer gewählt – wird als neuer Eintrag in der Personenliste angelegt.', 'No match picked – will be created as a new entry in the people list.')
                : t('Aus der Personenliste wählen oder neuen Namen eingeben.', 'Pick from the people list or type a new name.')} />} />}
      {sameName && <Alert severity="warning">{t(`„${sameName.name}“ existiert bereits. Wähle die Person aus der Liste, um Doppelungen zu vermeiden.`,
        `“${sameName.name}” already exists. Pick them from the list to avoid a duplicate.`)}</Alert>}
      <Autocomplete options={linkable} value={linkedAccount} loading={accounts.isLoading}
        getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_, option) => setUserId(option?.id ?? null)}
        renderInput={(params) => <TextField {...params} label={t('Verknüpftes App-Konto (optional)', 'Linked app account (optional)')}
          helperText={t('Eventcrew hat meist kein Konto.', 'Event crew usually has no account.')} />} />

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', pt: 1 }}>
        <Typography variant="subtitle2" component="h3">{t('Rollen am Event', 'Roles at the event')}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setRoles((current) => [...current, { role: 'event_crew', factionId: '', factionName: null, assignment: '' }])}>
          {t('Rolle hinzufügen', 'Add role')}
        </Button>
      </Stack>
      {roles.map((row, index) => {
        const factionOptions = row.factionId && !factions.some((faction) => faction.id === row.factionId)
          ? [...factions, { id: row.factionId, name: row.factionName ?? row.factionId }] : factions;
        return <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'flex-start' } }}>
          <TextField select size="small" label={t('Rolle', 'Role')} value={row.role} sx={{ minWidth: 220 }}
            onChange={(e) => updateRole(index, { role: e.target.value as AttendeeRoleKind })}>
            {ATTENDEE_ROLES.map((role) => <MenuItem key={role} value={role}>{roleLabels[role]}</MenuItem>)}
          </TextField>
          {FACTION_ROLES.includes(row.role) && <TextField select size="small" required fullWidth label={t('Fraktion', 'Faction')} value={row.factionId}
            error={!row.factionId} helperText={!factionOptions.length ? t(`Keine Fraktionen für ${eventType}.`, `No factions for ${eventType}.`) : undefined}
            onChange={(e) => updateRole(index, { factionId: e.target.value, factionName: factionOptions.find((faction) => faction.id === e.target.value)?.name ?? null })}>
            {factionOptions.map((faction) => <MenuItem key={faction.id} value={faction.id}>{faction.name}</MenuItem>)}
          </TextField>}
          {row.role === 'event_crew' && <TextField size="small" fullWidth label={t('Zugeteilte Arbeit', 'Assigned work')} value={row.assignment}
            placeholder={t('z. B. Küche, Aufbau, Funk', 'e.g. kitchen, setup, radio')} onChange={(e) => updateRole(index, { assignment: e.target.value })}
            slotProps={{ htmlInput: { maxLength: 255 } }} />}
          {row.role === 'as_held' && <Box sx={{ flex: 1 }} />}
          <IconButton title={t('Rolle entfernen', 'Remove role')} disabled={roles.length === 1}
            onClick={() => setRoles((current) => current.filter((_, position) => position !== index))}><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Stack>;
      })}
      {duplicateRole && <Alert severity="warning">{t('Jede Rolle kann pro Fraktion nur einmal vergeben werden.', 'Each role can be held only once per faction.')}</Alert>}

      <Typography variant="subtitle2" component="h3" sx={{ pt: 1 }}>{t('Reise & Verpflegung', 'Travel & catering')}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth type="datetime-local" label={t('Anreise', 'Arrival')} value={arrivesAt} onChange={(e) => setArrivesAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField fullWidth type="datetime-local" label={t('Abreise', 'Departure')} value={leavesAt} onChange={(e) => setLeavesAt(e.target.value)} error={invalidRange}
          helperText={invalidRange ? t('Abreise muss nach der Anreise liegen.', 'Departure must be at or after arrival.') : undefined}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: arrivesAt || undefined } }} />
      </Stack>
      <Typography variant="caption" color="text.secondary">{t('Ortszeit am Event. Unbekannte Reisezeiten können leer bleiben.', 'Local time at the event. Leave unknown travel times empty.')}</Typography>
      <Alert icon={<RestaurantOutlinedIcon />} severity="info">{t('Pro Person: 4 Hauptmahlzeit-Marken + 1 Frühstücksmarke, unabhängig von der Anzahl der Rollen.', 'Per person: 4 main-meal stamps + 1 breakfast stamp, regardless of the number of roles.')}</Alert>
      <FormControlLabel control={<Checkbox checked={foodStampsIssued} onChange={(e) => setFoodStampsIssued(e.target.checked)} />} label={t('Essensmarken bereits ausgegeben', 'Food stamps already issued')} />
      <TextField fullWidth multiline minRows={2} label={t('Anmerkungen', 'Notes')} value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
    </Stack>
  </DialogForm>;
}
