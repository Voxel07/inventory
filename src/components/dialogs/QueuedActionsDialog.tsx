import { useState } from 'react';
import { Box, Button, DialogActions, DialogContent, DialogTitle, Divider, List, ListItem, ListItemText, Typography } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import type { OfflineAction } from '../../services/offlineQueue';
import { useLocalizedText } from '../../utils/naming';

export function QueuedActionsDialog({ open, actions, onClose, onDiscard, discarding }: {
  open: boolean;
  actions: OfflineAction[];
  onClose: () => void;
  onDiscard: (idempotencyKey: string) => Promise<boolean>;
  discarding: boolean;
}) {
  const t = useLocalizedText();
  const [selected, setSelected] = useState<OfflineAction | null>(null);
  const actionName = (action: OfflineAction) => {
    switch (action.type) {
      case 'transaction': return t('Bestandsbuchung', 'Stock transaction');
      case 'order.create': return t('Bestellung erstellen', 'Create order');
      case 'order.transition': return t('Bestellstatus ändern', 'Change order status');
      case 'order.prepare': return t('Bestellung vorbereiten', 'Prepare order');
      case 'order.return': return t('Bestellung zurückgeben', 'Return order');
      case 'damage.create': return t('Schaden melden', 'Report damage');
      default: return action.type.replaceAll('.', ' ');
    }
  };
  return <>
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('Wartende Aktionen', 'Queued actions')}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {actions.length === 0 ? <Typography color="text.secondary" sx={{ p: 2 }}>{t('Keine Aktionen in der Warteschlange.', 'No queued actions.')}</Typography> :
          <List dense sx={{ py: 0 }}>{actions.map((action, index) => <Box key={action.idempotencyKey}>
            {index > 0 && <Divider />}
            <ListItem sx={{ alignItems: 'flex-start', gap: 1 }}>
              <ListItemText
                disableTypography
                primary={actionName(action)}
                secondary={<>
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>{new Date(action.localTimestamp).toLocaleString()}</Typography>
                  <Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.75rem', m: 0, mt: 0.5 }}>{JSON.stringify(action.payload, null, 2)}</Box>
                </>}
                sx={{ minWidth: 0, m: 0 }}
              />
              <Button size="small" color="error" onClick={() => setSelected(action)} disabled={discarding}>
                {t('Entfernen', 'Remove')}
              </Button>
            </ListItem>
          </Box>)}</List>}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Schließen', 'Close')}</Button></DialogActions>
    </Dialog>
    <ConfirmDialog
      open={Boolean(selected)}
      title={t('Aktion entfernen', 'Remove action')}
      message={t('Diese Aktion wird nicht synchronisiert. Wirklich entfernen?', 'This action will not be synced. Remove it?')}
      actionLabel={t('Entfernen', 'Remove')}
      actionColor="error"
      pending={discarding}
      onClose={() => setSelected(null)}
      onConfirm={() => { if (selected) void onDiscard(selected.idempotencyKey).then((removed) => { if (removed) setSelected(null); }); }}
    />
  </>;
}
