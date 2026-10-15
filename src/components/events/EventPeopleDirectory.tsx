import { useState } from 'react';
import { Alert, Autocomplete, Box, Chip, DialogContent, DialogTitle, InputAdornment, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import SearchIcon from '@mui/icons-material/Search';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import { Button, IconButton } from '../shared/ActionButtons';
import { Dialog } from '../shared/ClosableDialog';
import { FormDialog, DialogForm } from '../shared/FormDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { QueryFeedback } from '../common/QueryFeedback';
import { useDeleteEventPerson, useEventAccounts, useEventPeople, useSaveEventPerson } from '../../hooks/useEventLogistics';
import { useUIStore } from '../../store/uiStore';
import { useT } from '../../utils/naming';
import type { EventPerson } from '../../types/eventLogistics';

/**
 * The shared list of people the attendee form picks from. Planners keep it
 * tidy here and add someone to the current event straight from a row.
 */
export function EventPeopleDirectory({ open, onClose, attendingPersonIds, onAddToEvent }: {
  open: boolean;
  onClose: () => void;
  attendingPersonIds: string[];
  onAddToEvent: (person: EventPerson) => void;
}) {
  const t = useT();
  const people = useEventPeople();
  const remove = useDeleteEventPerson();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EventPerson | 'new' | null>(null);
  const [deleting, setDeleting] = useState<EventPerson | null>(null);
  const term = search.trim().toLocaleLowerCase();
  const all = people.data ?? [];
  const visible = all.filter((person) => [person.name, person.userName ?? ''].join(' ').toLocaleLowerCase().includes(term));

  return <>
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('events.eventPeopleDirectory.peopleList')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('events.eventPeopleDirectory.everyoneKnownAcrossEventsAddPersonSuggestsEntriesFromThis')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between' }}>
            <TextField size="small" autoFocus label={t('events.eventPeopleDirectory.searchPeople')} value={search} onChange={(e) => setSearch(e.target.value)}
              sx={{ width: { xs: '100%', sm: 300 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('events.eventPeopleDirectory.newEntry')}</Button>
          </Stack>
          <QueryFeedback isLoading={people.isLoading} error={people.error} />
          {!people.isLoading && !people.error && (!all.length
            ? <Alert severity="info">{t('events.eventPeopleDirectory.noPeopleYetCreateTheFirstEntry')}</Alert>
            : <TableContainer>
              <Table size="small" aria-label={t('events.eventPeopleDirectory.peopleList')}>
                <TableHead><TableRow>
                  <TableCell>{t('profile.name')}</TableCell>
                  <TableCell>{t('events.eventPeopleDirectory.appAccount')}</TableCell>
                  <TableCell align="right">{t('nav.events')}</TableCell>
                  <TableCell align="right">{t('common.actions')}</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {visible.map((person) => {
                    const attending = attendingPersonIds.includes(person.id);
                    return <TableRow key={person.id} hover>
                      <TableCell sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{person.name}</TableCell>
                      <TableCell>{person.userName
                        ? <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><AccountCircleOutlinedIcon fontSize="small" color="action" /><span>{person.userName}</span></Stack>
                        : '—'}</TableCell>
                      <TableCell align="right" className="tabular">{person.attendances}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {attending
                          ? <Chip size="small" variant="outlined" color="success" label={t('events.eventPeopleDirectory.attending')} sx={{ mr: 1 }} />
                          : <Button size="small" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={() => onAddToEvent(person)}>{t('events.eventPeopleDirectory.addToEvent')}</Button>}
                        <IconButton title={t('events.eventPeopleDirectory.editName', { name: String(person.name) })} onClick={() => setEditing(person)}><EditOutlinedIcon fontSize="small" /></IconButton>
                        <IconButton title={person.attendances > 0
                          ? t('events.eventPeopleDirectory.peopleWhoAttendEventsCannotBeDeleted')
                          : t('events.eventPeopleDirectory.deleteName', { name: String(person.name) })}
                          disabled={person.attendances > 0} onClick={() => setDeleting(person)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>;
                  })}
                  {!visible.length && <TableRow><TableCell colSpan={4}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{t('events.eventPeopleDirectory.noMatchingPeople')}</span>
                      {term && <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('events.eventPeopleDirectory.createSearch', { search: String(search.trim()) })}</Button>}
                    </Stack>
                  </TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>)}
        </Stack>
      </DialogContent>
    </Dialog>
    <FormDialog open={editing !== null} onClose={() => setEditing(null)}>
      {editing && <PersonForm person={editing === 'new' ? undefined : editing} initialName={editing === 'new' ? search.trim() : ''}
        onDone={() => setEditing(null)} />}
    </FormDialog>
    <ConfirmDialog open={Boolean(deleting)} title={t('events.eventPeopleDirectory.deletePerson')}
      message={t('events.eventPeopleDirectory.deleteNameFromThePeopleList', { name: String(deleting?.name ?? '') })}
      actionLabel={t('common.delete')} actionColor="error" pending={remove.isPending} onClose={() => { if (!remove.isPending) setDeleting(null); }}
      onConfirm={() => { if (deleting) remove.mutate(deleting.id, {
        onSuccess: () => { setDeleting(null); showSnackbar(t('events.eventPeopleDirectory.personDeleted'), 'success'); },
        onError: (error) => showSnackbar(error.message, 'error'),
      }); }} />
  </>;
}

function PersonForm({ person, initialName, onDone }: { person?: EventPerson; initialName: string; onDone: () => void }) {
  const t = useT();
  const save = useSaveEventPerson();
  const accounts = useEventAccounts(true);
  const people = useEventPeople();
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [name, setName] = useState(person?.name ?? initialName);
  const [userId, setUserId] = useState<string | null>(person?.userId ?? null);
  const linkable = (accounts.data ?? []).filter((account) => !account.linkedPersonId || account.linkedPersonId === person?.id);
  const linkedAccount = linkable.find((account) => account.id === userId)
    ?? (userId ? { id: userId, name: person?.userName ?? userId, linkedPersonId: person?.id ?? null } : null);
  const sameName = (people.data ?? []).find((other) => other.id !== person?.id && other.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());

  return <DialogForm title={person ? t('events.eventPeopleDirectory.editPerson') : t('events.eventPeopleDirectory.newEntry')}
    pending={save.isPending} error={save.error?.message} onCancel={onDone} submitDisabled={!name.trim()}
    onSubmit={() => save.mutate({ id: person?.id, data: { name: name.trim(), userId } }, {
      onSuccess: () => { onDone(); showSnackbar(t('events.eventPeopleDirectory.personSaved'), 'success'); },
    })}>
    <TextField autoFocus required fullWidth label={t('profile.name')} value={name} onChange={(e) => setName(e.target.value)}
      helperText={person ? t('events.eventPeopleDirectory.renamingAppliesToThisPersonAtEveryEvent') : undefined}
      slotProps={{ htmlInput: { maxLength: 255 } }} />
    {sameName && <Alert severity="warning">{t('events.eventPeopleDirectory.nameIsAlreadyOnTheList', { name: String(sameName.name) })}</Alert>}
    <Box>
      <Autocomplete options={linkable} value={linkedAccount} loading={accounts.isLoading}
        getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_, option) => setUserId(option?.id ?? null)}
        renderInput={(params) => <TextField {...params} label={t('events.eventPeopleDirectory.linkedAppAccountOptional')}
          helperText={t('events.eventPeopleDirectory.eventCrewUsuallyHasNoAccount')} />} />
    </Box>
  </DialogForm>;
}
