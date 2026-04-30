import {
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Chip,
    Skeleton,
    Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import type { Item, StockTransaction } from '../../types';

interface Props {
    items: Item[] | undefined;
    transactions: StockTransaction[] | undefined;
    isLoading: boolean;
    onEdit: (item: Item) => void;
    onDelete: (id: string) => void;
    onShowQR: (item: Item) => void;
}

const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
    available: 'success',
    checked_out: 'warning',
    damaged: 'error',
    retired: 'default',
};

function getCheckedOut(itemId: string, transactions: StockTransaction[] | undefined): number {
    if (!transactions) return 0;
    let net = 0;
    for (const tx of transactions) {
        if (tx.itemId !== itemId) continue;
        if (tx.transactionType === 'checkout') net += tx.quantityChanged;
        else if (tx.transactionType === 'checkin') net -= tx.quantityChanged;
    }
    return Math.max(0, net);
}

export function ItemsList({ items, transactions, isLoading, onEdit, onDelete, onShowQR }: Props) {
    if (isLoading) {
        return (
            <Paper sx={{ p: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} height={48} />
                ))}
            </Paper>
        );
    }

    if (!items?.length) {
        return (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No items found</Typography>
            </Paper>
        );
    }

    return (
        <TableContainer component={Paper}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="right">Checked Out</TableCell>
                        <TableCell align="right">Remaining</TableCell>
                        <TableCell align="right">Unit Value</TableCell>
                        <TableCell align="right">Total Value</TableCell>
                        <TableCell>Location</TableCell>
                        <TableCell>Position</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.map((item) => {
                        const checkedOut = getCheckedOut(item.id, transactions);
                        const remaining = item.amount - checkedOut;
                        const totalValue = (item.value ?? 0) * item.amount;
                        return (
                            <TableRow key={item.id} hover>
                                <TableCell>{item.name}</TableCell>
                                <TableCell>{item.category}</TableCell>
                                <TableCell align="right">{item.amount}</TableCell>
                                <TableCell align="right">{checkedOut}</TableCell>
                                <TableCell align="right">{remaining}</TableCell>
                                <TableCell align="right">{item.value?.toFixed(2) ?? '0.00'} €</TableCell>
                                <TableCell align="right">{totalValue.toFixed(2)} €</TableCell>
                                <TableCell>{item.storageLocation}</TableCell>
                                <TableCell>{item.position}</TableCell>
                                <TableCell>
                                    <Chip
                                        label={item.status.replace('_', ' ')}
                                        color={statusColors[item.status] ?? 'default'}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton size="small" onClick={() => onShowQR(item)} aria-label="show QR code">
                                        <QrCode2Icon />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => onEdit(item)} aria-label="edit item">
                                        <EditIcon />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => onDelete(item.id)} aria-label="delete item">
                                        <DeleteIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
