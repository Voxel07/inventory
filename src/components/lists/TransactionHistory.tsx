import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Skeleton,
    Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { TooltipButton } from '../shared/TooltipButton';
import type { StockTransaction, Item } from '../../types';
import { formatStatus } from '../../utils/formatters';

interface Props {
    transactions: StockTransaction[] | undefined;
    items: Item[] | undefined;
    isLoading: boolean;
    onEdit?: (tx: StockTransaction) => void;
}

export function TransactionHistory({ transactions, items, isLoading, onEdit }: Props) {
    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    if (!transactions?.length) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">Keine Transaktionen gefunden</Typography>
            </Paper>
        );
    }

    function getItemName(itemId: string) {
        return items?.find((i) => i.id === itemId)?.name ?? itemId;
    }

    return (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Datum</TableCell>
                        <TableCell>Artikel</TableCell>
                        <TableCell>Typ</TableCell>
                        <TableCell>Benutzer</TableCell>
                        <TableCell align="right">Menge</TableCell>
                        <TableCell>Grund</TableCell>
                        <TableCell>Anmerkungen</TableCell>
                        {onEdit && <TableCell align="center">Aktionen</TableCell>}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {transactions.map((tx) => (
                        <TableRow key={tx.id} hover>
                            <TableCell>{new Date(tx.timestamp).toLocaleString()}</TableCell>
                            <TableCell>{getItemName(tx.itemId)}</TableCell>
                            <TableCell>
                                <Chip
                                    label={formatStatus(tx.transactionType)}
                                    color={tx.transactionType === 'checkout' ? 'warning' : tx.transactionType === 'added' ? 'info' : 'success'}
                                    size="small"
                                />
                            </TableCell>
                            <TableCell>{tx.expand?.userId?.name || 'N/A'}</TableCell>
                            <TableCell align="right">{tx.quantityChanged}</TableCell>
                            <TableCell>{tx.reason}</TableCell>
                            <TableCell>{tx.notes}</TableCell>
                            {onEdit && (
                                <TableCell align="center">
                                    <TooltipButton
                                        variant="icon"
                                        tooltipText="Transaktion bearbeiten"
                                        icon={<EditIcon sx={{ fontSize: 18 }} />}
                                        onClick={() => onEdit(tx)}
                                        size="small"
                                    />
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
