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
import type { StockTransaction, User } from '../../types';
import { formatStatus } from '../../utils/formatters';
import { formatDateTime } from '../../utils/dateFormat';
import { useT } from '../../utils/naming';
import { Link } from 'react-router-dom';

interface Props {
    transactions: StockTransaction[] | undefined;
    users?: User[] | undefined;
    isLoading: boolean;
}

export function TransactionHistory({ transactions, users, isLoading }: Props) {
    const t = useT();
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
                <Typography color="text.secondary">{t('lists.transactionHistory.noTransactionsFound')}</Typography>
            </Paper>
        );
    }

    function getUserName(tx: StockTransaction) {
        const expandedUser = tx.expand?.userId;
        if (expandedUser) {
            return expandedUser.name?.trim() || expandedUser.username?.trim() || expandedUser.email?.trim() || tx.userId || '—';
        }
        const foundUser = users?.find((u) => u.id === tx.userId);
        return foundUser ? foundUser.name?.trim() || foundUser.username?.trim() || foundUser.email?.trim() || tx.userId : tx.userId || '—';
    }

    function assetChip(tx: StockTransaction) {
        const asset = tx.expand?.assetInstanceId;
        if (!asset) return null;
        return (
            <Chip
                size="small"
                variant="outlined"
                label={[asset.assetCode, asset.serialNumber && `SN ${asset.serialNumber}`].filter(Boolean).join(' · ')}
                sx={{ height: 20, fontSize: '0.7rem', color: 'text.primary', borderColor: 'divider' }}
            />
        );
    }

    const transactionColor = (type: StockTransaction['transactionType']): 'warning' | 'info' | 'success' | 'error' => {
        if (type === 'checkout') return 'warning';
        if (type === 'added') return 'info';
        if (type === 'written_off') return 'error';
        return 'success';
    };

    function orderChip(tx: StockTransaction, compact = false) {
        const compactSx = compact ? {
            height: 20,
            flexShrink: 0,
            fontSize: '0.7rem',
            '& .MuiChip-label': { px: 0.75 },
        } : undefined;
        if (!tx.orderId) {
            if (!tx.eventType || !tx.faction) return null;
            return (
                <Chip
                    size="small"
                    variant="outlined"
                    label={`${tx.eventType} · ${tx.faction}`}
                    sx={compactSx}
                />
            );
        }
        const order = tx.expand?.order;
        return (
            <Chip
                component={Link}
                clickable
                to={order?.kind === 'general' ? `/orders?pickupOrder=${tx.orderId}&pickupKind=general` : `/orders/faction/${tx.orderId}`}
                size="small"
                variant="outlined"
                color="primary"
                label={order?.orderCode ?? t('lists.transactionHistory.factionList')}
                sx={compactSx}
            />
        );
    }

    if (isMobile) return (
        <Stack spacing={1.25}>
            {transactions.map((tx) => (
                <Paper key={tx.id} sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{tx.itemName}</Typography>
                            {assetChip(tx)}
                            <Typography variant="caption" color="text.secondary">
                                {formatDateTime(tx.timestamp)} · {getUserName(tx)}
                            </Typography>
                        </Box>
                        <Chip label={formatStatus(tx.transactionType)} color={transactionColor(tx.transactionType)} size="small" />
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 1.5 }}>
                        <Typography variant="body2" color="text.secondary">{tx.reason}{tx.notes ? ` · ${tx.notes}` : ''}</Typography>
                        <Typography variant="h6" sx={{ flexShrink: 0 }}>× {tx.quantityChanged}</Typography>
                    </Box>
                    {(tx.orderId || (tx.eventType && tx.faction)) && <Box sx={{ mt: 1 }}>{orderChip(tx)}</Box>}
                </Paper>
            ))}
        </Stack>
    );

    return (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('common.date')}</TableCell>
                        <TableCell>{t('common.item')}</TableCell>
                        <TableCell>{t('common.type')}</TableCell>
                        <TableCell>{t('common.user')}</TableCell>
                        <TableCell align="right">{t('common.quantity')}</TableCell>
                        <TableCell>{t('common.reason')}</TableCell>
                        <TableCell>{t('common.notes')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {transactions.map((tx) => (
                        <TableRow key={tx.id} hover>
                            <TableCell>{formatDateTime(tx.timestamp)}</TableCell>
                            <TableCell>
                                <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                                    <span>{tx.itemName}</span>
                                    {assetChip(tx)}
                                </Stack>
                            </TableCell>
                            <TableCell>
                                <Chip
                                    label={formatStatus(tx.transactionType)}
                                    color={transactionColor(tx.transactionType)}
                                    size="small"
                                />
                            </TableCell>
                            <TableCell>{getUserName(tx)}</TableCell>
                            <TableCell align="right">{tx.quantityChanged}</TableCell>
                            <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, whiteSpace: 'nowrap' }}>
                                    <span>{tx.reason}</span>
                                    {orderChip(tx, true)}
                                </Box>
                            </TableCell>
                            <TableCell>{tx.notes}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
