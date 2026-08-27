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
    Box,
    Stack,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { TooltipButton } from '../shared/TooltipButton';
import type { StockTransaction, Item, User } from '../../types';
import { formatStatus } from '../../utils/formatters';
import { useTranslate } from '../../utils/naming';
import { Link } from 'react-router-dom';

interface Props {
    transactions: StockTransaction[] | undefined;
    items: Item[] | undefined;
    users?: User[] | undefined;
    isLoading: boolean;
    onEdit?: (tx: StockTransaction) => void;
}

export function TransactionHistory({ transactions, items, users, isLoading, onEdit }: Props) {
    const t = useTranslate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
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
                <Typography color="text.secondary">{t('Keine Transaktionen gefunden', 'No transactions found')}</Typography>
            </Paper>
        );
    }

    function getItemName(itemId: string) {
        return items?.find((i) => i.id === itemId)?.name ?? itemId;
    }

    function getUserName(tx: StockTransaction) {
        const expandedUser = tx.expand?.userId;
        if (expandedUser) {
            const name = expandedUser.name?.trim();
            if (name) return name;
            if (expandedUser.username?.trim()) return expandedUser.username.trim();
            if (expandedUser.email?.trim()) return expandedUser.email.trim();
        }
        if (tx.userId && users?.length) {
            const user = users.find((u) => u.id === tx.userId);
            if (user) {
                const name = user.name?.trim();
                if (name) return name;
                if (user.username?.trim()) return user.username.trim();
                if (user.email?.trim()) return user.email.trim();
            }
        }
        return tx.userId || 'N/A';
    }

    const transactionColor = (type: StockTransaction['transactionType']): 'warning' | 'info' | 'success' | 'error' => {
        if (type === 'checkout') return 'warning';
        if (type === 'added') return 'info';
        if (type === 'written_off') return 'error';
        return 'success';
    };
    const canEdit = (tx: StockTransaction) => onEdit && !tx.damageReportId && !tx.factionOrderId && tx.transactionType !== 'repaired' && tx.transactionType !== 'written_off';

    function orderChip(tx: StockTransaction) {
        if (!tx.factionOrderId) return null;
        const order = tx.expand?.factionOrderId;
        return (
            <Chip
                component={Link}
                clickable
                to={`/events/orders/${tx.factionOrderId}`}
                size="small"
                variant="outlined"
                color="primary"
                label={order ? `${order.eventType} · ${order.faction}` : t('Fraktionsliste', 'Faction list')}
            />
        );
    }

    if (isMobile) return (
        <Stack spacing={1.25}>
            {transactions.map((tx) => (
                <Paper key={tx.id} sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{getItemName(tx.itemId)}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {new Date(tx.timestamp).toLocaleString()} · {getUserName(tx)}
                            </Typography>
                        </Box>
                        <Chip label={formatStatus(tx.transactionType)} color={transactionColor(tx.transactionType)} size="small" />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 1.5 }}>
                        <Typography variant="body2" color="text.secondary">{tx.reason}{tx.notes ? ` · ${tx.notes}` : ''}</Typography>
                        <Typography variant="h6" sx={{ flexShrink: 0 }}>× {tx.quantityChanged}</Typography>
                    </Box>
                    {tx.factionOrderId && <Box sx={{ mt: 1 }}>{orderChip(tx)}</Box>}
                    {canEdit(tx) && <Box sx={{ textAlign: 'right', mt: 0.5 }}><TooltipButton variant="icon" tooltipText={t('Transaktion bearbeiten', 'Edit transaction')} icon={<EditIcon />} onClick={() => onEdit?.(tx)} /></Box>}
                </Paper>
            ))}
        </Stack>
    );

    return (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('Datum', 'Date')}</TableCell>
                        <TableCell>{t('Artikel', 'Item')}</TableCell>
                        <TableCell>{t('Typ', 'Type')}</TableCell>
                        <TableCell>{t('Benutzer', 'User')}</TableCell>
                        <TableCell align="right">{t('Menge', 'Quantity')}</TableCell>
                        <TableCell>{t('Grund', 'Reason')}</TableCell>
                        <TableCell>{t('Anmerkungen', 'Notes')}</TableCell>
                        {onEdit && <TableCell align="center">{t('Aktionen', 'Actions')}</TableCell>}
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
                                    color={transactionColor(tx.transactionType)}
                                    size="small"
                                />
                            </TableCell>
                            <TableCell>{getUserName(tx)}</TableCell>
                            <TableCell align="right">{tx.quantityChanged}</TableCell>
                            <TableCell><Stack spacing={0.5}><span>{tx.reason}</span>{orderChip(tx)}</Stack></TableCell>
                            <TableCell>{tx.notes}</TableCell>
                            {onEdit && (
                                <TableCell align="center">
                                    {canEdit(tx) && <TooltipButton
                                        variant="icon"
                                        tooltipText={t('Transaktion bearbeiten', 'Edit transaction')}
                                        icon={<EditIcon sx={{ fontSize: 18 }} />}
                                        onClick={() => onEdit(tx)}
                                        size="small"
                                    />}
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
