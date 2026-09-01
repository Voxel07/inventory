import { useMemo, useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Button,
    Skeleton,
    Tooltip,
    Stack,
    useMediaQuery,
    useTheme,
    TextField,
    MenuItem,
} from '@mui/material';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import { useItems } from '../hooks/useItems';
import { useTransactions, useCreateTransaction } from '../hooks/useTransactions';
import { useUIStore } from '../store/uiStore';
import { useNames, useTranslate } from '../utils/naming';

interface CheckedOutRow {
    key: string;
    itemId: string;
    name: string;
    category: string;
    storageLocation: string;
    checkedOut: number;
    personId: string;
    person: string;
    eventKey: string;
    event: string;
    factionOrderId?: string;
}

export function CheckedOutItemsPage() {
    const names = useNames();
    const t = useTranslate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
    const { data: items, isLoading: itemsLoading } = useItems();
    const { data: transactions, isLoading: txLoading } = useTransactions();
    const createTransaction = useCreateTransaction();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [search, setSearch] = useState('');
    const [personFilter, setPersonFilter] = useState('');
    const [eventFilter, setEventFilter] = useState('');

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
            const eventKey = order ? `${order.eventType}:${order.faction}` : tx.reason || t('Ohne Event', 'No event');
            const key = `${tx.itemId}:${tx.userId}:${tx.factionOrderId ?? 'manual'}`;
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
                event: existing?.event ?? (order ? `${order.eventType} · ${order.faction}${order.orderCode ? ` · ${order.orderCode}` : ''}` : tx.reason || t('Ohne Event', 'No event')),
                factionOrderId: tx.factionOrderId,
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
        createTransaction.mutate(
            {
                itemId: row.itemId,
                transactionType: 'checkin',
                quantityChanged: 1,
                reason: names.reason.returnAfterUse,
                notes: t('Schnelle Rückgabe aus der Ansicht für ausgeliehene Artikel', 'Quick return from the checked-out items view'),
                userId: row.personId,
                factionOrderId: row.factionOrderId,
            },
            {
                onSuccess: () => showSnackbar(t('Artikel zurückgegeben', 'Item returned'), 'success'),
                onError: () => showSnackbar(t('Fehler bei der Rückgabe des Artikels', 'Could not return item'), 'error'),
            },
        );
    }

    if (itemsLoading || txLoading) {
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

            {visibleRows.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography color="text.secondary">{t('Derzeit sind keine Artikel ausgeliehen.', 'No items are currently checked out.')}</Typography>
                </Paper>
            ) : (
                isMobile ? (
                    <Stack spacing={1.5}>
                        {visibleRows.map((row) => (
                            <Paper key={row.key} sx={{ p: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="h6" sx={{ fontSize: '1rem', overflowWrap: 'anywhere' }}>{row.name}</Typography>
                                        <Typography variant="body2" color="text.secondary">{row.category || '—'} · {row.storageLocation}</Typography>
                                        <Typography variant="body2">{row.person}</Typography>
                                        <Typography variant="caption" color="text.secondary">{row.event}</Typography>
                                    </Box>
                                    <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                                        <Typography variant="h5" color="warning.main">{row.checkedOut}</Typography>
                                        <Typography variant="caption" color="text.secondary">{t('draußen', 'out')}</Typography>
                                    </Box>
                                </Box>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    color="success"
                                    startIcon={<AssignmentReturnIcon />}
                                    onClick={() => handleQuickReturn(row)}
                                    disabled={createTransaction.isPending}
                                    sx={{ mt: 2, minHeight: 48 }}
                                >
                                    {t('1 Einheit zurückgeben', 'Return 1 unit')}
                                </Button>
                            </Paper>
                        ))}
                    </Stack>
                ) : <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('Name', 'Name')}</TableCell>
                                <TableCell>{t('Kategorie', 'Category')}</TableCell>
                                <TableCell>{t('Lagerort', 'Storage location')}</TableCell>
                                <TableCell>{t('Person', 'Person')}</TableCell>
                                <TableCell>{t('Event', 'Event')}</TableCell>
                                <TableCell align="right">{t('Ausgeliehen', 'Checked out')}</TableCell>
                                <TableCell align="right">{t('Aktion', 'Action')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visibleRows.map((row) => (
                                <TableRow key={row.key} hover>
                                    <TableCell>{row.name}</TableCell>
                                    <TableCell>{row.category}</TableCell>
                                    <TableCell>{row.storageLocation}</TableCell>
                                    <TableCell>{row.person}</TableCell>
                                    <TableCell>{row.event}</TableCell>
                                    <TableCell align="right">{row.checkedOut}</TableCell>
                                    <TableCell align="right">
                                        <Tooltip title={`${names.action.checkin}: 1 ${t('Einheit', 'unit')}`} arrow>
                                            <span>
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    onClick={() => handleQuickReturn(row)}
                                                    disabled={createTransaction.isPending}
                                                >
                                                    {t('Schnellrückgabe', 'Quick return')}
                                                </Button>
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Box>
    );
}
