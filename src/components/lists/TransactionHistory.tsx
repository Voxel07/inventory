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
                <Typography color="text.secondary">No transactions found</Typography>
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
                        <TableCell>Date</TableCell>
                        <TableCell>Item</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>User</TableCell>
                        <TableCell align="right">Quantity</TableCell>
                        <TableCell>Reason</TableCell>
                        <TableCell>Notes</TableCell>
                        {onEdit && <TableCell align="center">Actions</TableCell>}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {transactions.map((tx) => (
                        <TableRow key={tx.id} hover>
                            <TableCell>{new Date(tx.timestamp).toLocaleString()}</TableCell>
                            <TableCell>{getItemName(tx.itemId)}</TableCell>
                            <TableCell>
                                <Chip
                                    label={tx.transactionType === 'checkout' ? 'Check Out' : tx.transactionType === 'added' ? 'Added' : 'Check In'}
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
                                        tooltipText="Edit Transaction"
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
