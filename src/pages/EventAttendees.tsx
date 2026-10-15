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
import { useT } from '../utils/naming';
import { formatDateTime } from '../utils/dateFormat';
import { useUIStore } from '../store/uiStore';
import { ATTENDEE_ROLES, FACTION_ROLES } from '../types/eventLogistics';
import type { AttendeeRole, AttendeeRoleKind, EventAttendee, EventAttendeeInput, EventPerson } from '../types/eventLogistics';
import type { EventType } from '../types';

function useRoleLabels(): Record<AttendeeRoleKind, string> {
  const t = useT();
  return {
    faction_leader: t('profile.roles.factionLeader'),
    faction_deputy: t('pages.eventAttendees.factionDeputy'),
    faction_hq_crew: t('pages.eventAttendees.hQCrew'),
    as_held: 'AS-Held',
    event_crew: t('pages.eventAttendees.eventCrew'),
  };
}

function roleText(role: AttendeeRole, labels: Record<AttendeeRoleKind, string>) {
  if (FACTION_ROLES.includes(role.role)) return `${labels[role.role]} · ${role.factionName ?? '—'}`;
  return role.assignment ? `${labels[role.role]}: ${role.assignment}` : labels[role.role];
}

export function EventAttendees() {
  const t = useT();
  const workspace = useEventWorkspace();
  return <Box>
    <PageHeader title={t('common.eventAttendees')} description={t('pages.eventAttendees.whoIsAttendingInWhichRoleWhenTheyArriveAnd')} />
    <EventWorkspace workspace={workspace} page="attendees" />
    {workspace.event && !workspace.query.error && <AttendeeList key={workspace.event.id} eventId={workspace.event.id} eventType={workspace.event.eventType} />}
  </Box>;
}

function AttendeeList({ eventId, eventType }: { eventId: string; eventType: EventType }) {
  const t = useT();
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
        showSnackbar(t('pages.eventAttendees.attendeeSaved'), 'success');
      },
    });
  }

  return <>
    <QueryFeedback isLoading={query.isLoading} error={query.error} />
    {ready && <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2, mb: 3 }}>
        <EventMetric label={t('pages.eventAttendees.attendees')} value={attendees.length} detail={t('pages.eventAttendees.missingDatesWithTravelTimesToConfirm', { missingDates: missingDates })} />
        <EventMetric label={t('pages.eventAttendees.mainMealStamps')} value={totalMain} detail={t('pages.eventAttendees.4PerPerson')} />
        <EventMetric label={t('pages.eventAttendees.breakfastStamps')} value={totalBreakfast} detail={t('pages.eventAttendees.1PerPerson')} />
        <EventMetric label={t('pages.eventAttendees.stillToIssue')} value={unissued.reduce((sum, attendee) => sum + attendee.mainMealStamps + attendee.breakfastStamps, 0)}
          detail={t('pages.eventAttendees.forUnissuedCountPeople', { unissuedCount: String(unissued.length) })} />
      </Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField size="small" label={t('pages.eventAttendees.searchAttendees')} value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t('pages.eventAttendees.nameRoleOrFaction')} sx={{ width: { xs: '100%', sm: 300 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            <TextField select size="small" label={t('profile.role')} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as AttendeeRoleKind | '')} sx={{ minWidth: 220 }}>
              <MenuItem value="">{t('pages.eventAttendees.allRoles')}</MenuItem>
              {ATTENDEE_ROLES.map((role) => <MenuItem key={role} value={role}>{roleLabels[role]}</MenuItem>)}
            </TextField>
          </Stack>
          {canEdit && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" startIcon={<GroupsOutlinedIcon />} onClick={() => setDirectoryOpen(true)}>{t('pages.eventAttendees.peopleList')}</Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { save.reset(); setPickedPerson(undefined); setEditing('new'); }}>{t('pages.eventAttendees.addPerson')}</Button>
          </Stack>}
        </Stack>
      </Paper>
      {!attendees.length ? <Alert severity="info">{t('pages.eventAttendees.noAttendeesYetAddTheFirstPeopleToPlanRoles')}</Alert>
        : <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('pages.eventAttendees.visibleCountOfAttendeeCountPeople', { visibleCount: String(visible.length), attendeeCount: String(attendees.length) })}</Typography>
          <TableContainer component={Paper}>
            <Table size="small" sx={{ minWidth: 960 }} aria-label={t('pages.eventAttendees.attendeesAndCatering')}>
              <TableHead><TableRow>
                <TableCell>{t('enum.value.person')}</TableCell><TableCell>{t('pages.eventAttendees.roles')}</TableCell>
                <TableCell>{t('pages.eventAttendees.arrival')}</TableCell><TableCell>{t('pages.eventAttendees.departure')}</TableCell>
                <TableCell>{t('pages.eventAttendees.foodStamps')}</TableCell><TableCell>{t('pages.eventAttendees.issued')}</TableCell>
                {canEdit && <TableCell align="right">{t('common.actions')}</TableCell>}
              </TableRow></TableHead>
              <TableBody>
                {visible.map((attendee) => <TableRow key={attendee.id} hover>
                  <TableCell sx={{ maxWidth: 260, overflowWrap: 'anywhere' }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <Typography sx={{ fontWeight: 600 }}>{attendee.person.name}</Typography>
                      {attendee.person.userId && <AccountCircleOutlinedIcon fontSize="small" color="action" titleAccess={t('pages.eventAttendees.linkedToUserName', { userName: String(attendee.person.userName) })} />}
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
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{attendee.arrivesAt ? formatDateTime(attendee.arrivesAt) : <Chip size="small" variant="outlined" label={t('pages.eventAttendees.toConfirm')} />}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{attendee.leavesAt ? formatDateTime(attendee.leavesAt) : <Chip size="small" variant="outlined" label={t('pages.eventAttendees.toConfirm')} />}</TableCell>
                  <TableCell><Typography variant="body2">{t('pages.eventAttendees.mainMealStampsMainMeals', { mainMealStamps: String(attendee.mainMealStamps) })}</Typography><Typography variant="body2" color="text.secondary">{t('pages.eventAttendees.breakfastStampsBreakfast', { breakfastStamps: String(attendee.breakfastStamps) })}</Typography></TableCell>
                  <TableCell><Chip size="small" color={attendee.foodStampsIssued ? 'success' : 'warning'} variant="outlined" label={attendee.foodStampsIssued ? t('pages.eventAttendees.issued2') : t('pages.eventAttendees.needed')} /></TableCell>
                  {canEdit && <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton title={t('pages.eventAttendees.editName', { name: String(attendee.person.name) })} onClick={() => { save.reset(); setEditing(attendee); }}><EditOutlinedIcon fontSize="small" /></IconButton>
                    <IconButton title={t('pages.eventAttendees.removeName', { name: String(attendee.person.name) })} onClick={() => setDeleting(attendee)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </TableCell>}
                </TableRow>)}
                {!visible.length && <TableRow><TableCell colSpan={canEdit ? 7 : 6}>{t('pages.eventAttendees.noMatchingAttendees')}</TableCell></TableRow>}
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
    <ConfirmDialog open={Boolean(deleting)} title={t('pages.eventAttendees.removeAttendee')}
      message={t('pages.eventAttendees.removeNameFromThisEventThePersonStaysAvailableFor', { name: String(deleting?.person.name ?? '') })}
      actionLabel={t('common.remove')} actionColor="error" pending={remove.isPending} onClose={() => { if (!remove.isPending) setDeleting(null); }}
      onConfirm={() => { if (deleting) remove.mutate(deleting.id, {
        onSuccess: () => { setDeleting(null); showSnackbar(t('pages.eventAttendees.attendeeRemoved'), 'success'); },
        onError: (error) => showSnackbar(error.message, 'error'),
      }); }} />
  </>;
}

type RoleRow = { role: AttendeeRoleKind; factionId: string; factionName: string | null; assignment: string };

function AttendeeForm({ attendee, initialPerson, eventType, attendingPersonIds, pending, error, onSubmit, onCancel }: {
  attendee?: EventAttendee; initialPerson?: EventPerson; eventType: EventType; attendingPersonIds: string[]; pending: boolean; error?: string;
  onSubmit: (data: EventAttendeeInput) => void; onCancel: () => void;
}) {
  const t = useT();
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

  return <DialogForm title={attendee ? t('pages.eventAttendees.editAttendee') : t('pages.eventAttendees.addPerson')}
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
      <Typography variant="subtitle2" component="h3">{t('enum.value.person')}</Typography>
      {attendee
        ? <TextField autoFocus required fullWidth label={t('profile.name')} value={personName} onChange={(e) => setPersonName(e.target.value)}
          helperText={t('pages.eventAttendees.renamingAppliesToThisPersonAtEveryEvent')} slotProps={{ htmlInput: { maxLength: 255 } }} />
        : <Autocomplete freeSolo options={candidates} value={person} inputValue={personName} loading={people.isLoading}
          getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
          isOptionEqualToValue={(option, value) => typeof value !== 'string' && option.id === value.id}
          renderOption={(props, option) => <li {...props} key={option.id}>
            <Box><Typography>{option.name}</Typography><Typography variant="caption" color="text.secondary">
              {t('pages.eventAttendees.attendancesEvents', { attendances: String(option.attendances) })}{option.userName ? ` · ${option.userName}` : ''}
            </Typography></Box>
          </li>}
          onChange={(_, option) => pickPerson(option)}
          onInputChange={(_, value, reason) => {
            setPersonName(value);
            if (reason === 'input' || reason === 'clear') { setPerson(null); setUserId(null); }
          }}
          renderInput={(params) => <TextField {...params} autoFocus required label={t('profile.name')}
            slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, maxLength: 255 } }}
            helperText={person ? t('pages.eventAttendees.knownPersonAttendancesEvents', { attendances: String(person.attendances) })
              : personName.trim() ? t('pages.eventAttendees.noMatchPickedWillBeCreatedAsANewEntry')
                : t('pages.eventAttendees.pickFromThePeopleListOrTypeANewName')} />} />}
      {sameName && <Alert severity="warning">{t('pages.eventAttendees.nameAlreadyExistsPickThemFromTheListToAvoid', { name: String(sameName.name) })}</Alert>}
      <Autocomplete options={linkable} value={linkedAccount} loading={accounts.isLoading}
        getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_, option) => setUserId(option?.id ?? null)}
        renderInput={(params) => <TextField {...params} label={t('pages.eventAttendees.linkedAppAccountOptional')}
          helperText={t('pages.eventAttendees.eventCrewUsuallyHasNoAccount')} />} />

      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', pt: 1 }}>
        <Typography variant="subtitle2" component="h3">{t('pages.eventAttendees.rolesAtTheEvent')}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setRoles((current) => [...current, { role: 'event_crew', factionId: '', factionName: null, assignment: '' }])}>
          {t('pages.eventAttendees.addRole')}
        </Button>
      </Stack>
      {roles.map((row, index) => {
        const factionOptions = row.factionId && !factions.some((faction) => faction.id === row.factionId)
          ? [...factions, { id: row.factionId, name: row.factionName ?? row.factionId }] : factions;
        return <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'flex-start' } }}>
          <TextField select size="small" label={t('profile.role')} value={row.role} sx={{ minWidth: 220 }}
            onChange={(e) => updateRole(index, { role: e.target.value as AttendeeRoleKind })}>
            {ATTENDEE_ROLES.map((role) => <MenuItem key={role} value={role}>{roleLabels[role]}</MenuItem>)}
          </TextField>
          {FACTION_ROLES.includes(row.role) && <TextField select size="small" required fullWidth label={t('common.faction')} value={row.factionId}
            error={!row.factionId} helperText={!factionOptions.length ? t('pages.eventAttendees.noFactionsForEventType', { eventType: eventType }) : undefined}
            onChange={(e) => updateRole(index, { factionId: e.target.value, factionName: factionOptions.find((faction) => faction.id === e.target.value)?.name ?? null })}>
            {factionOptions.map((faction) => <MenuItem key={faction.id} value={faction.id}>{faction.name}</MenuItem>)}
          </TextField>}
          {row.role === 'event_crew' && <TextField size="small" fullWidth label={t('pages.eventAttendees.assignedWork')} value={row.assignment}
            placeholder={t('pages.eventAttendees.eGKitchenSetupRadio')} onChange={(e) => updateRole(index, { assignment: e.target.value })}
            slotProps={{ htmlInput: { maxLength: 255 } }} />}
          {row.role === 'as_held' && <Box sx={{ flex: 1 }} />}
          <IconButton title={t('pages.eventAttendees.removeRole')} disabled={roles.length === 1}
            onClick={() => setRoles((current) => current.filter((_, position) => position !== index))}><DeleteOutlineIcon fontSize="small" /></IconButton>
        </Stack>;
      })}
      {duplicateRole && <Alert severity="warning">{t('pages.eventAttendees.eachRoleCanBeHeldOnlyOncePerFaction')}</Alert>}

      <Typography variant="subtitle2" component="h3" sx={{ pt: 1 }}>{t('pages.eventAttendees.travelCatering')}</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth type="datetime-local" label={t('pages.eventAttendees.arrival')} value={arrivesAt} onChange={(e) => setArrivesAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField fullWidth type="datetime-local" label={t('pages.eventAttendees.departure')} value={leavesAt} onChange={(e) => setLeavesAt(e.target.value)} error={invalidRange}
          helperText={invalidRange ? t('pages.eventAttendees.departureMustBeAtOrAfterArrival') : undefined}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: arrivesAt || undefined } }} />
      </Stack>
      <Typography variant="caption" color="text.secondary">{t('pages.eventAttendees.localTimeAtTheEventLeaveUnknownTravelTimesEmpty')}</Typography>
      <Alert icon={<RestaurantOutlinedIcon />} severity="info">{t('pages.eventAttendees.perPerson4MainMealStamps1BreakfastStampRegardless')}</Alert>
      <FormControlLabel control={<Checkbox checked={foodStampsIssued} onChange={(e) => setFoodStampsIssued(e.target.checked)} />} label={t('pages.eventAttendees.foodStampsAlreadyIssued')} />
      <TextField fullWidth multiline minRows={2} label={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
    </Stack>
  </DialogForm>;
}
