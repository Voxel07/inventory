import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    List,
    ListItem,
    ListItemText,
    Typography,
} from '@mui/material';
import { useTranslate } from '../../utils/naming';
import type { SyncFailure } from '../../services/offlineQueue';

export function SyncIssuesDialog({
    open,
    failures,
    onClose,
    onDiscard,
    discarding = false,
}: {
    open: boolean;
    failures: SyncFailure[];
    onClose: () => void;
    onDiscard: (idempotencyKey: string) => void;
    discarding?: boolean;
}) {
    const t = useTranslate();
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{t('Synchronisierungsprobleme', 'Sync issues')}</DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                {failures.length === 0 ? (
                    <Box sx={{ p: 2 }}>
                        <Typography color="text.secondary">
                            {t('Keine offenen Synchronisierungsprobleme.', 'No open sync issues.')}
                        </Typography>
                    </Box>
                ) : (
                    <List dense sx={{ py: 0 }}>
                        {failures.map((failure, index) => (
                            <Box key={failure.idempotencyKey}>
                                {index > 0 && <Divider />}
                                <ListItem
                                    secondaryAction={
                                        <Button
                                            size="small"
                                            color="error"
                                            onClick={() => onDiscard(failure.idempotencyKey)}
                                            disabled={discarding}
                                        >
                                            {t('Verwerfen', 'Discard')}
                                        </Button>
                                    }
                                >
                                    <ListItemText
                                        primary={`${failure.type} · ${failure.status}`}
                                        secondary={`${failure.error} · ${new Date(failure.timestamp).toLocaleString()}`}
                                        sx={{ whiteSpace: 'normal', pr: 12 }}
                                    />
                                </ListItem>
                            </Box>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('Schließen', 'Close')}</Button>
            </DialogActions>
        </Dialog>
    );
}
