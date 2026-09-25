import { Button, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Typography } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { useLocalizedText } from '../../utils/naming';

export function CatalogInstructionsDialog({ open, title, hint, parts, onClose }: {
    open: boolean;
    title: string;
    hint?: string;
    parts?: { id: string; name: string; quantity: number }[];
    onClose: () => void;
}) {
    const t = useLocalizedText();
    return <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent dividers>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('Besondere Anweisungen', 'Special instructions')}</Typography>
            <Typography color={hint ? 'text.primary' : 'text.secondary'} sx={{ whiteSpace: 'pre-wrap' }}>
                {hint || t('Keine besonderen Anweisungen.', 'No special instructions.')}
            </Typography>
            {parts && <>
                <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>{t('Enthaltene Artikel', 'Included items')}</Typography>
                {parts.length === 0 ? <Typography color="text.secondary">{t('Keine Artikel enthalten.', 'No items included.')}</Typography> :
                    <List dense disablePadding>{parts.map((part) => <ListItem key={part.id} disableGutters>
                        <ListItemText primary={`${part.quantity} × ${part.name}`} />
                    </ListItem>)}</List>}
            </>}
        </DialogContent>
        <DialogActions><Button onClick={onClose}>{t('Schließen', 'Close')}</Button></DialogActions>
    </Dialog>;
}
