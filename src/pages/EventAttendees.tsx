import { useState } from 'react';
import { Alert, Autocomplete, Box, Checkbox, Chip, FormControlLabel, InputAdornment, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography } from '@mui/material';
import { DateRangeField, TextField } from '../components/shared/DateTextField';
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
import { TimelineSchedule } from '../components/events/EventTimelineSchedule';
import { attendeeHooks, useCateringSettings, useSaveCateringSettings, useEventAccounts, useEventPeople } from '../hooks/useEventLogistics';
import { useEventWorkspace } from '../hooks/useEventWorkspace';
import { useFactionCatalog } from '../hooks/useFactionCatalog';
import { useAuth } from '../hooks/useAuth';
import { canEditEvents } from '../utils/access';
import { useT } from '../utils/naming';
import { formatDateTime } from '../utils/dateFormat';
import { factionColor } from '../utils/factionColors';
import { useUIStore } from '../store/uiStore';
import { ATTENDEE_ROLES, FACTION_ROLES } from '../types/eventLogistics';
import type { AttendeeRole, AttendeeRoleKind, CateringSettings, EventAttendee, EventAttendeeInput, EventPerson } from '../types/eventLogistics';
import type { EventReport, EventType } from '../types';

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
    {workspace.event && !workspace.query.error && <AttendeeList key={workspace.event.id} event={workspace.event} />}
  </Box>;
}

function AttendeeList({ event }: { event: EventReport }) {
  const { id: eventId, eventType } = event;
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
  const [sortBy, setSortBy] = useState<'name' | 'roles' | 'arrivesAt'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [editing, setEditing] = useState<EventAttendee | 'new' | null>(null);
  const [deleting, setDeleting] = useState<EventAttendee | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [pickedPerson, setPickedPerson] = useState<EventPerson | undefined>();
  const attendees = query.data ?? [];
  const unissued = attendees.filter((attendee) => !attendee.foodStampsIssued);
  const missingDates = attendees.filter((attendee) => !attendee.arrivesAt || !attendee.leavesAt).length;
  const term = search.trim().toLocaleLowerCase();
  const visible = attendees.filter((attendee) => (!roleFilter || attendee.roles.some((role) => role.role === roleFilter))
    && [attendee.person.name, attendee.notes ?? '', ...attendee.roles.map((role) => roleText(role, roleLabels))].join(' ').toLocaleLowerCase().includes(term))
    .sort((left, right) => {
      const nameOrder = left.person.name.localeCompare(right.person.name);
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortBy === 'arrivesAt') {
        if (!left.arrivesAt || !right.arrivesAt) return left.arrivesAt ? -1 : right.arrivesAt ? 1 : nameOrder;
        return direction * left.arrivesAt.localeCompare(right.arrivesAt) || nameOrder;
      }
      if (sortBy === 'roles') {
        const rank = (attendee: EventAttendee) => Math.min(...attendee.roles.map((role) => ATTENDEE_ROLES.indexOf(role.role)));
        const factions = (attendee: EventAttendee) => attendee.roles.map((role) => role.factionName ?? '').sort().join(',');
        return direction * (rank(left) - rank(right) || factions(left).localeCompare(factions(right))) || nameOrder;
      }
      return direction * nameOrder;
    });
  const totalMain = attendees.reduce((sum, attendee) => sum + attendee.mainMealStamps, 0);
  const totalBreakfast = attendees.reduce((sum, attendee) => sum + attendee.breakfastStamps, 0);
  const ready = !query.isLoading && !query.error;

  function changeSort(column: typeof sortBy) {
    setSortDirection(sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc');
    setSortBy(column);
  }

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
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mb: 2 }}>
        <EventMetric compact label={t('pages.eventAttendees.attendees')} value={attendees.length} detail={missingDates ? t('pages.eventAttendees.missingDatesWithTravelTimesToConfirm', { missingDates }) : undefined} />
        <EventMetric compact label={t('pages.eventAttendees.mainMealStamps')} value={totalMain} />
        <EventMetric compact label={t('pages.eventAttendees.breakfastStamps')} value={totalBreakfast} />
        <EventMetric compact label={t('pages.eventAttendees.stillToIssue')} value={unissued.reduce((sum, attendee) => sum + attendee.mainMealStamps + attendee.breakfastStamps, 0)}
          detail={t('pages.eventAttendees.forUnissuedCountPeople', { unissuedCount: String(unissued.length) })} />
      </Box>
      <CateringRates eventId={eventId} canEdit={canEdit} />
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
                <TableCell sortDirection={sortBy === 'name' ? sortDirection : false}><TableSortLabel active={sortBy === 'name'} direction={sortBy === 'name' ? sortDirection : 'asc'} onClick={() => changeSort('name')}>{t('enum.value.person')}</TableSortLabel></TableCell>
                <TableCell sortDirection={sortBy === 'roles' ? sortDirection : false}><TableSortLabel active={sortBy === 'roles'} direction={sortBy === 'roles' ? sortDirection : 'asc'} onClick={() => changeSort('roles')}>{t('pages.eventAttendees.roles')}</TableSortLabel></TableCell>
                <TableCell sortDirection={sortBy === 'arrivesAt' ? sortDirection : false}><TableSortLabel active={sortBy === 'arrivesAt'} direction={sortBy === 'arrivesAt' ? sortDirection : 'asc'} onClick={() => changeSort('arrivesAt')}>{t('pages.eventAttendees.arrival')}</TableSortLabel></TableCell>
                <TableCell>{t('pages.eventAttendees.departure')}</TableCell>
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
                      {attendee.roles.map((role) => <Chip key={`${role.role}:${role.factionId ?? ''}`} size="small" sx={{ maxWidth: '100%', ...(factionColor(eventType, role.factionName) && { bgcolor: factionColor(eventType, role.factionName), color: (theme) => theme.palette.getContrastText(factionColor(eventType, role.factionName)!) }) }}
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
    <Box sx={{ mt: 3 }}><TimelineSchedule eventId={eventId} startDate={event.startDate} endDate={event.endDate} fixedCategory="catering" /></Box>
    <FormDialog open={editing !== null} maxWidth="md" onClose={() => { if (!save.isPending) setEditing(null); }}>
      {editing && <AttendeeForm attendee={editing === 'new' ? undefined : editing} initialPerson={pickedPerson} eventType={eventType} startDate={event.startDate} endDate={event.endDate}
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

function CateringRates({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const query = useCateringSettings(eventId);
  return <>
    <QueryFeedback isLoading={query.isLoading} error={query.error} />
    {query.data && <CateringRatesForm key={JSON.stringify(query.data)} eventId={eventId} settings={query.data} canEdit={canEdit} />}
  </>;
}

function CateringRatesForm({ eventId, settings, canEdit }: { eventId: string; settings: CateringSettings; canEdit: boolean }) {
  const t = useT();
  const save = useSaveCateringSettings(eventId);
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [rates, setRates] = useState({ dailyMainMealStamps: String(settings.dailyMainMealStamps), dailyBreakfastStamps: String(settings.dailyBreakfastStamps), firstDayMainMealStamps: String(settings.firstDayMainMealStamps) });
  const fields = ['dailyMainMealStamps', 'dailyBreakfastStamps', 'firstDayMainMealStamps'] as const;
  const changed = fields.some((field) => Number(rates[field]) !== settings[field]);
  const invalid = fields.some((field) => rates[field] === '' || !Number.isInteger(Number(rates[field])) || Number(rates[field]) < 0 || Number(rates[field]) > 1000);
  return <Paper component="form" sx={{ p: 1.5, mb: 2 }} onSubmit={(event) => {
    event.preventDefault();
    if (!canEdit || !changed || invalid || save.isPending) return;
    save.mutate({ dailyMainMealStamps: Number(rates.dailyMainMealStamps), dailyBreakfastStamps: Number(rates.dailyBreakfastStamps), firstDayMainMealStamps: Number(rates.firstDayMainMealStamps) }, {
      onSuccess: () => showSnackbar(t('pages.eventAttendees.cateringSettingsSaved'), 'success'),
    });
  }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
      {fields.map((field) => <TextField key={field} size="small" type="number" required label={t(`pages.eventAttendees.${field}`)} value={rates[field]}
        sx={{ flex: 1 }} disabled={save.isPending} slotProps={{ input: { readOnly: !canEdit }, htmlInput: { min: 0, max: 1000, step: 1 } }}
        onChange={(event) => setRates((current) => ({ ...current, [field]: event.target.value }))} />)}
      {canEdit && changed && <Button type="submit" disabled={save.isPending || invalid}>{t('common.save')}</Button>}
    </Stack>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{t('pages.eventAttendees.cateringCalculation')}</Typography>
    {save.error && <Alert severity="error" sx={{ mt: 1 }}>{save.error.message}</Alert>}
  </Paper>;
}

type RoleRow = { role: AttendeeRoleKind; factionId: string; factionName: string | null; assignment: string };

function AttendeeForm({ attendee, initialPerson, eventType, startDate, endDate, attendingPersonIds, pending, error, onSubmit, onCancel }: {
  attendee?: EventAttendee; initialPerson?: EventPerson; eventType: EventType; startDate: string; endDate: string; attendingPersonIds: string[]; pending: boolean; error?: string;
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
  const [arrivesAt, setArrivesAt] = useState(attendee ? attendee.arrivesAt?.slice(0, 16) ?? '' : `${startDate.slice(0, 10)}T00:00`);
  const [leavesAt, setLeavesAt] = useState(attendee ? attendee.leavesAt?.slice(0, 16) ?? '' : `${endDate.slice(0, 10)}T23:59`);
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
      <DateRangeField withTime startLabel={t('pages.eventAttendees.arrival')} endLabel={t('pages.eventAttendees.departure')} start={arrivesAt} end={leavesAt}
        rangeErrorText={t('pages.eventAttendees.departureMustBeAtOrAfterArrival')}
        onChange={(range) => { setArrivesAt(range.start); setLeavesAt(range.end); }} />
      <Typography variant="caption" color="text.secondary">{t('pages.eventAttendees.localTimeAtTheEventLeaveUnknownTravelTimesEmpty')}</Typography>
      <Alert icon={<RestaurantOutlinedIcon />} severity="info">{t('pages.eventAttendees.cateringCalculation')}</Alert>
      <FormControlLabel control={<Checkbox checked={foodStampsIssued} onChange={(e) => setFoodStampsIssued(e.target.checked)} />} label={t('pages.eventAttendees.foodStampsAlreadyIssued')} />
      <TextField fullWidth multiline minRows={2} label={t('common.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />
    </Stack>
  </DialogForm>;
}
