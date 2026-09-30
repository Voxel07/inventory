import { useCustodyBalances } from '../hooks/useCustodyBalances';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import {
    Box,
    Button,
    DialogContent,
    DialogTitle,
    MenuItem,
    Paper,
    Skeleton,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useItems } from '../hooks/useItems';
import { useNavigate } from 'react-router-dom';
import { useAssemblies } from '../hooks/useAssemblies';
import { useUIStore } from '../store/uiStore';
import { useLocalizedText } from '../utils/naming';
import { CheckedOutList } from '../components/lists/CheckedOutList';
import type { CheckedOutRow } from '../types/custody';
import { ReturnSubmissionForm } from '../components/forms/ReturnSubmissionForm';
import { useCreateReturnSubmission } from '../hooks/useReturnSubmissions';
import type { ReturnSubmissionFormData } from '../types';

export function CheckedOutItemsPage() {
    const t = useLocalizedText();
    const custody = useCustodyBalances();
    const { data: items, isLoading: itemsPending, isComplete: itemsComplete, isError: itemsError, refetch: refetchItems } = useItems();
    const navigate = useNavigate();
    const { data: assemblies } = useAssemblies();
    const createReturn = useCreateReturnSubmission();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [search, setSearch] = useState('');
    const [personFilter, setPersonFilter] = useState('');
    const [eventFilter, setEventFilter] = useState('');
    const [returnRow, setReturnRow] = useState<CheckedOutRow>();

    const checkedOutRows: CheckedOutRow[] = custody.data ?? [];

    const people = [...new Map(checkedOutRows.map((row) => [row.personId, row.person])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const events = [...new Map(checkedOutRows.map((row) => [row.eventKey, row.event])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const visibleRows = checkedOutRows.filter((row) => {
        const term = search.trim().toLocaleLowerCase();
        return (!term || `${row.name} ${row.category} ${row.person} ${row.event}`.toLocaleLowerCase().includes(term))
            && (!personFilter || row.personId === personFilter)
            && (!eventFilter || row.eventKey === eventFilter);
    });

    function handleQuickReturn(row: CheckedOutRow) {
        if (row.generalOrderId) { navigate('/orders?tab=general'); return; }
        if (row.factionOrderId) { navigate(`/orders/faction/${row.factionOrderId}`); return; }
        setReturnRow(row);
    }

    function submitReturn(data: ReturnSubmissionFormData) {
        createReturn.mutate(data, {
            onSuccess: () => {
                setReturnRow(undefined);
                showSnackbar(t('Rückgabe wartet auf Bestätigung', 'Return is awaiting acknowledgement'), 'success');
            },
            onError: () => showSnackbar(t('Rückgabe konnte nicht gemeldet werden', 'Could not submit return'), 'error'),
        });
    }

    if (itemsError || custody.isError) {
        return <Paper sx={{ p: 3 }}>
            <Typography>{t('Die vollständige Ausleihliste konnte nicht geladen werden.', 'Could not load the complete checkout list.')}</Typography>
            <Button onClick={() => { void refetchItems(); void custody.refetch(); }}>{t('Erneut versuchen', 'Retry')}</Button>
        </Paper>;
    }

    if (itemsPending || !itemsComplete || custody.isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    return (
        <Box>
            <Typography variant="h4" sx={{ mb: 3 }}>
                {t('Ausgeliehene Artikel', 'Checked-out items')}
            </Typography>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField fullWidth size="small" label={t('Artikel, Person oder Event suchen', 'Search item, person, or event')} value={search} onChange={(event) => setSearch(event.target.value)} />
                    <TextField select size="small" label={t('Person', 'Person')} value={personFilter} onChange={(event) => setPersonFilter(event.target.value)} sx={{ minWidth: 190 }}>
                        <MenuItem value="">{t('Alle Personen', 'All people')}</MenuItem>
                        {people.map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label={t('Event', 'Event')} value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} sx={{ minWidth: 220 }}>
                        <MenuItem value="">{t('Alle Events', 'All events')}</MenuItem>
                        {events.map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
                    </TextField>
                </Stack>
            </Paper>

            <CheckedOutList
                key={`${search}:${personFilter}:${eventFilter}`}
                rows={visibleRows}
                assemblies={assemblies}
                showPerson
                linkToItem
                onQuickReturn={handleQuickReturn}
                returnPending={createReturn.isPending}
            />
            <Dialog open={Boolean(returnRow)} onClose={() => setReturnRow(undefined)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('Rückgabe melden', 'Submit return')}</DialogTitle>
                <DialogContent>
                    {returnRow && items?.find((item) => item.id === returnRow.itemId) && (
                        <ReturnSubmissionForm
                            item={items.find((item) => item.id === returnRow.itemId)!}
                            maxQuantity={returnRow.checkedOut - (returnRow.pendingQuantity ?? 0)}
                            eventOccurrenceId={returnRow.eventOccurrenceId}
                            assetInstanceId={returnRow.assetInstanceId}
                            returnedForUserId={returnRow.personId}
                            factionOrderId={returnRow.factionOrderId}
                            onSubmit={submitReturn}
                            isLoading={createReturn.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
