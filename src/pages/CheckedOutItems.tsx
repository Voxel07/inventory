import { Dialog } from '../components/shared/ClosableDialog';
import { useMemo, useState } from 'react';
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
import { useTransactions } from '../hooks/useTransactions';
import { useAssemblies } from '../hooks/useAssemblies';
import { useUIStore } from '../store/uiStore';
import { useLocalizedText } from '../utils/naming';
import { CheckedOutList, type CheckedOutRow } from '../components/lists/CheckedOutList';
import { ReturnSubmissionForm } from '../components/forms/ReturnSubmissionForm';
import { useCreateReturnSubmission } from '../hooks/useReturnSubmissions';
import type { ReturnSubmissionFormData } from '../types';

export function CheckedOutItemsPage() {
    const t = useLocalizedText();
    const { data: items, isLoading: itemsPending, isComplete: itemsComplete, isError: itemsError, refetch: refetchItems } = useItems();
    const { data: transactions, isLoading: txPending, isComplete: txComplete, isError: txError, refetch: refetchTransactions } = useTransactions();
    const { data: assemblies } = useAssemblies();
    const createReturn = useCreateReturnSubmission();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [search, setSearch] = useState('');
    const [personFilter, setPersonFilter] = useState('');
    const [eventFilter, setEventFilter] = useState('');
    const [returnRow, setReturnRow] = useState<CheckedOutRow>();

    const checkedOutRows = useMemo<CheckedOutRow[]>(() => {
        if (!items?.length) return [];

        const itemMap = new Map(items.map((item) => [item.id, item]));
        const rows = new Map<string, CheckedOutRow>();
        const chronological = [...(transactions ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        for (const tx of chronological) {
            if (tx.transactionType !== 'checkout' && tx.transactionType !== 'checkin') continue;
            const item = itemMap.get(tx.itemId);
            if (!item) continue;
            const order = tx.expand?.factionOrderId;
            const eventKey = order ? `${order.eventType}:${order.faction}` : tx.eventType && tx.faction ? `${tx.eventType}:${tx.faction}` : t('Ohne Event', 'No event');
            const key = `${tx.itemId}:${tx.assetInstanceId ?? 'bulk'}:${tx.userId}:${tx.factionOrderId ?? 'manual'}`;
            const existing = rows.get(key);
            const amount = tx.transactionType === 'checkout' ? tx.quantityChanged : -tx.quantityChanged;
            const loc = item.expand?.storageLocation;
            rows.set(key, {
                key,
                itemId: item.id,
                name: item.name,
                category: item.category,
                storageLocation: loc ? [loc.name, loc.location, loc.position].filter(Boolean).join(' / ') : item.storageLocation || '—',
                checkedOut: Math.max(0, (existing?.checkedOut ?? 0) + amount),
                personId: tx.userId,
                person: tx.expand?.userId?.name || tx.expand?.userId?.email || tx.userId,
                eventKey: existing?.eventKey ?? eventKey,
                event: existing?.event ?? (order ? `${order.eventType} · ${order.faction}${order.orderCode ? ` · ${order.orderCode}` : ''}` : tx.eventType && tx.faction ? `${tx.eventType} · ${tx.faction}` : t('Ohne Event', 'No event')),
                factionOrderId: tx.factionOrderId,
                assetInstanceId: tx.assetInstanceId,
            });
        }
        return [...rows.values()].filter((row) => row.checkedOut > 0).sort((a, b) => b.checkedOut - a.checkedOut);
    }, [items, transactions, t]);

    const people = useMemo(() => [...new Map(checkedOutRows.map((row) => [row.personId, row.person])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [checkedOutRows]);
    const events = useMemo(() => [...new Map(checkedOutRows.map((row) => [row.eventKey, row.event])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [checkedOutRows]);
    const visibleRows = useMemo(() => checkedOutRows.filter((row) => {
        const term = search.trim().toLocaleLowerCase();
        return (!term || `${row.name} ${row.category} ${row.person} ${row.event}`.toLocaleLowerCase().includes(term))
            && (!personFilter || row.personId === personFilter)
            && (!eventFilter || row.eventKey === eventFilter);
    }), [checkedOutRows, eventFilter, personFilter, search]);

    function handleQuickReturn(row: CheckedOutRow) {
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

    if (itemsError || txError) {
        return <Paper sx={{ p: 3 }}>
            <Typography>{t('Die vollständige Ausleihliste konnte nicht geladen werden.', 'Could not load the complete checkout list.')}</Typography>
            <Button onClick={() => { void refetchItems(); void refetchTransactions(); }}>{t('Erneut versuchen', 'Retry')}</Button>
        </Paper>;
    }

    if (itemsPending || txPending || !itemsComplete || !txComplete) {
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
                            maxQuantity={returnRow.checkedOut}
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
