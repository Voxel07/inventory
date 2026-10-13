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
import { useLocalizedText } from '../../utils/naming';
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
  const t = useLocalizedText();
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
      <DialogTitle>{t('Personenliste', 'People list')}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t('Alle bekannten Personen, eventübergreifend. „Person hinzufügen“ schlägt Einträge aus dieser Liste vor.',
              'Everyone known across events. “Add person” suggests entries from this list.')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between' }}>
            <TextField size="small" autoFocus label={t('Personen suchen', 'Search people')} value={search} onChange={(e) => setSearch(e.target.value)}
              sx={{ width: { xs: '100%', sm: 300 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('Neuer Eintrag', 'New entry')}</Button>
          </Stack>
          <QueryFeedback isLoading={people.isLoading} error={people.error} />
          {!people.isLoading && !people.error && (!all.length
            ? <Alert severity="info">{t('Noch keine Personen. Lege den ersten Eintrag an.', 'No people yet. Create the first entry.')}</Alert>
            : <TableContainer>
              <Table size="small" aria-label={t('Personenliste', 'People list')}>
                <TableHead><TableRow>
                  <TableCell>{t('Name', 'Name')}</TableCell>
                  <TableCell>{t('App-Konto', 'App account')}</TableCell>
                  <TableCell align="right">{t('Events', 'Events')}</TableCell>
                  <TableCell align="right">{t('Aktionen', 'Actions')}</TableCell>
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
                          ? <Chip size="small" variant="outlined" color="success" label={t('Dabei', 'Attending')} sx={{ mr: 1 }} />
                          : <Button size="small" startIcon={<PersonAddAlt1OutlinedIcon />} onClick={() => onAddToEvent(person)}>{t('Zum Event', 'Add to event')}</Button>}
                        <IconButton title={t(`${person.name} bearbeiten`, `Edit ${person.name}`)} onClick={() => setEditing(person)}><EditOutlinedIcon fontSize="small" /></IconButton>
                        <IconButton title={person.attendances > 0
                          ? t('Personen mit Event-Teilnahmen können nicht gelöscht werden', 'People who attend events cannot be deleted')
                          : t(`${person.name} löschen`, `Delete ${person.name}`)}
                          disabled={person.attendances > 0} onClick={() => setDeleting(person)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>;
                  })}
                  {!visible.length && <TableRow><TableCell colSpan={4}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{t('Keine passenden Personen.', 'No matching people.')}</span>
                      {term && <Button size="small" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t(`„${search.trim()}“ anlegen`, `Create “${search.trim()}”`)}</Button>}
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
    <ConfirmDialog open={Boolean(deleting)} title={t('Person löschen', 'Delete person')}
      message={t(`${deleting?.name ?? ''} aus der Personenliste löschen?`, `Delete ${deleting?.name ?? ''} from the people list?`)}
      actionLabel={t('Löschen', 'Delete')} actionColor="error" pending={remove.isPending} onClose={() => { if (!remove.isPending) setDeleting(null); }}
      onConfirm={() => { if (deleting) remove.mutate(deleting.id, {
        onSuccess: () => { setDeleting(null); showSnackbar(t('Person gelöscht', 'Person deleted'), 'success'); },
        onError: (error) => showSnackbar(error.message, 'error'),
      }); }} />
  </>;
}

function PersonForm({ person, initialName, onDone }: { person?: EventPerson; initialName: string; onDone: () => void }) {
  const t = useLocalizedText();
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

  return <DialogForm title={person ? t('Person bearbeiten', 'Edit person') : t('Neuer Eintrag', 'New entry')}
    pending={save.isPending} error={save.error?.message} onCancel={onDone} submitDisabled={!name.trim()}
    onSubmit={() => save.mutate({ id: person?.id, data: { name: name.trim(), userId } }, {
      onSuccess: () => { onDone(); showSnackbar(t('Person gespeichert', 'Person saved'), 'success'); },
    })}>
    <TextField autoFocus required fullWidth label={t('Name', 'Name')} value={name} onChange={(e) => setName(e.target.value)}
      helperText={person ? t('Eine Namensänderung gilt für diese Person bei allen Events.', 'Renaming applies to this person at every event.') : undefined}
      slotProps={{ htmlInput: { maxLength: 255 } }} />
    {sameName && <Alert severity="warning">{t(`„${sameName.name}“ steht bereits in der Liste.`, `“${sameName.name}” is already on the list.`)}</Alert>}
    <Box>
      <Autocomplete options={linkable} value={linkedAccount} loading={accounts.isLoading}
        getOptionLabel={(option) => option.name} isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_, option) => setUserId(option?.id ?? null)}
        renderInput={(params) => <TextField {...params} label={t('Verknüpftes App-Konto (optional)', 'Linked app account (optional)')}
          helperText={t('Eventcrew hat meist kein Konto.', 'Event crew usually has no account.')} />} />
    </Box>
  </DialogForm>;
}
