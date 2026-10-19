import { Button } from '../components/shared/ActionButtons';
import { useCustodyBalances } from '../hooks/useCustodyBalances';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import {
    Box,
    DialogContent,
    DialogTitle,
    MenuItem,
    Paper,
    Skeleton,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useItemsByIds } from '../hooks/useItems';
import { useQuery } from '@tanstack/react-query';
import { generalOrderApi } from '../services/orderService';
import { useAssemblies } from '../hooks/useAssemblies';
import { useUIStore } from '../store/uiStore';
import { translate, useT } from '../utils/naming';
import { CheckedOutList } from '../components/lists/CheckedOutList';
import type { CheckedOutRow } from '../types/custody';
import { ReturnSubmissionForm } from '../components/forms/ReturnSubmissionForm';
import { useCreateReturnSubmission } from '../hooks/useReturnSubmissions';
import type { ReturnSubmissionFormData } from '../types';
import { GeneralOrderWorkflow } from '../components/orders/GeneralOrderWorkflow';
import { generalOrderOf } from '../utils/custody';

export function CheckedOutItemsPage() {
    const t = useT();
    const custody = useCustodyBalances();
    const { data: assemblies } = useAssemblies();
    const createReturn = useCreateReturnSubmission();
    const showSnackbar = useUIStore((s) => s.showSnackbar);
    const [search, setSearch] = useState('');
    const [personFilter, setPersonFilter] = useState('');
    const [eventFilter, setEventFilter] = useState('');
    const [returnRow, setReturnRow] = useState<CheckedOutRow>();
    const [generalReturnRow, setGeneralReturnRow] = useState<CheckedOutRow>();
    // Exactly the item and order a quick return needs, never the catalog or every order page.
    const returnItem = useItemsByIds(returnRow ? [returnRow.itemId] : []).data?.[0];
    const generalOrder = useQuery({ queryKey: ['general-orders', 'detail', generalOrderOf(generalReturnRow)],
        queryFn: () => generalOrderApi.getById(generalOrderOf(generalReturnRow)!), enabled: Boolean(generalOrderOf(generalReturnRow)) });
    const generalReturnOrder = generalReturnRow && generalOrder.data;

    const checkedOutRows: CheckedOutRow[] = custody.data ?? [];

    const people = [...new Map(checkedOutRows.map((row) => [row.personId, row.person])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const events = [...new Map(checkedOutRows.map((row) => [row.eventKey, row.event])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const visibleRows = checkedOutRows.filter((row) => {
        const term = search.trim().toLocaleLowerCase();
        return (!term || `${row.name} ${row.category} ${row.person} ${row.event}`.toLocaleLowerCase().includes(term))
            && (!personFilter || row.personId === personFilter)
            && (!eventFilter || row.eventKey === eventFilter);
    });

    // General-order custody is reconciled on the order itself; everything else is submitted for acknowledgement.
    function handleQuickReturn(row: CheckedOutRow) {
        if (generalOrderOf(row)) setGeneralReturnRow(row);
        else setReturnRow(row);
    }

    function submitReturn(data: ReturnSubmissionFormData) {
        createReturn.mutate(data, {
            onSuccess: () => {
                setReturnRow(undefined);
                showSnackbar(t('pages.checkedOutItems.returnIsAwaitingAcknowledgement'), 'success');
            },
            onError: () => showSnackbar(t('pages.checkedOutItems.couldNotSubmitReturn'), 'error'),
        });
    }

    if (custody.isError) {
        return <Paper sx={{ p: 3 }}>
            <Typography>{t('pages.checkedOutItems.couldNotLoadTheCompleteCheckoutList')}</Typography>
            <Button title={translate('common.retryLoadingTheData')} onClick={() => { void custody.refetch(); }}>{t('pages.checkedOutItems.retry')}</Button>
        </Paper>;
    }

    if (custody.isLoading) {
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
                {t('pages.checkedOutItems.checkedOutItems')}
            </Typography>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField fullWidth size="small" label={t('pages.checkedOutItems.searchItemPersonOrEvent')} value={search} onChange={(event) => setSearch(event.target.value)} />
                    <TextField select size="small" label={t('enum.value.person')} value={personFilter} onChange={(event) => setPersonFilter(event.target.value)} sx={{ minWidth: 190 }}>
                        <MenuItem value="">{t('pages.checkedOutItems.allPeople')}</MenuItem>
                        {people.map(([id, name]) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label={t('nav.event')} value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} sx={{ minWidth: 220 }}>
                        <MenuItem value="">{t('pages.checkedOutItems.allEvents')}</MenuItem>
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
                <DialogTitle>{t('pages.checkedOutItems.submitReturn')}</DialogTitle>
                <DialogContent>
                    {returnRow && returnItem && (
                        <ReturnSubmissionForm
                            item={returnItem}
                            maxQuantity={returnRow.checkedOut - (returnRow.pendingQuantity ?? 0)}
                            eventOccurrenceId={returnRow.eventOccurrenceId}
                            assetInstanceId={returnRow.assetInstanceId}
                            returnedForUserId={returnRow.personId}
                            orderId={returnRow.orderId}
                            onSubmit={submitReturn}
                            isLoading={createReturn.isPending}
                        />
                    )}
                </DialogContent>
            </Dialog>
            {generalReturnRow && !generalReturnOrder && <Dialog open onClose={() => setGeneralReturnRow(undefined)} maxWidth="sm" fullWidth>
                <DialogTitle>{t('pages.checkedOutItems.recordReturn')}</DialogTitle>
                <DialogContent>
                    <Typography color={generalOrder.isError ? 'error' : 'text.secondary'}>
                        {generalOrder.isError
                            ? t('pages.checkedOutItems.couldNotLoadTheRelatedOrder')
                            : t('pages.checkedOutItems.loadingOrder')}
                    </Typography>
                </DialogContent>
            </Dialog>}
            {generalReturnRow && generalReturnOrder && <GeneralOrderWorkflow order={generalReturnOrder} action="return"
                itemIds={[generalReturnRow.itemId]} onClose={() => setGeneralReturnRow(undefined)} />}
        </Box>
    );
}
