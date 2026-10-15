import { formatDateTime } from '../../utils/dateFormat';
import { Button } from '../shared/ActionButtons';
import { OfflineStatusPanel } from '../operations/OfflineStatusPanel';
import { useState } from 'react';
import { Box, DialogActions, DialogContent, DialogTitle, Divider, List, ListItem, ListItemText, Typography } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import type { OfflineAction } from '../../services/offlineQueue';
import { translate, useT } from '../../utils/naming';

export function QueuedActionsDialog({ open, actions, onClose, onDiscard, discarding }: {
  open: boolean;
  actions: OfflineAction[];
  onClose: () => void;
  onDiscard: (idempotencyKey: string) => Promise<boolean>;
  discarding: boolean;
}) {
  const t = useT();
  const [selected, setSelected] = useState<OfflineAction | null>(null);
  const actionName = (action: OfflineAction) => {
    switch (action.type) {
      case 'transaction': return t('dialogs.queuedActionsDialog.stockTransaction');
      case 'order.create': return t('dialogs.queuedActionsDialog.createOrder');
      case 'order.transition': return t('dialogs.queuedActionsDialog.changeOrderStatus');
      case 'order.prepare': return t('dialogs.queuedActionsDialog.prepareOrder');
      case 'order.return': return t('dialogs.queuedActionsDialog.returnOrder');
      case 'damage.create': return t('common.reportDamage');
      default: return action.type.replaceAll('.', ' ');
    }
  };
  return <>
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('dialogs.queuedActionsDialog.queuedActions')}</DialogTitle>
      <DialogContent dividers sx={{ p: 2 }}>
        <OfflineStatusPanel />
        {actions.length === 0 ? <Typography color="text.secondary" sx={{ p: 2 }}>{t('dialogs.queuedActionsDialog.noQueuedActions')}</Typography> :
          <List dense sx={{ py: 0 }}>{actions.map((action, index) => <Box key={action.idempotencyKey}>
            {index > 0 && <Divider />}
            <ListItem sx={{ alignItems: 'flex-start', gap: 1 }}>
              <ListItemText
                disableTypography
                primary={`${actionName(action)} · ${t('dialogs.queuedActionsDialog.awaitingServerConfirmation')}`}
                secondary={<>
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>{formatDateTime(action.localTimestamp)}</Typography>
                  <Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.75rem', m: 0, mt: 0.5 }}>{JSON.stringify(action.payload, null, 2)}</Box>
                </>}
                sx={{ minWidth: 0, m: 0 }}
              />
              <Button title={translate('dialogs.queuedActionsDialog.discardThisQueuedAction')} size="small" color="error" onClick={() => setSelected(action)} disabled={discarding}>
                {t('common.remove')}
              </Button>
            </ListItem>
          </Box>)}</List>}
      </DialogContent>
      <DialogActions><Button title={translate('common.closeThisDialog')} onClick={onClose}>{t('common.close')}</Button></DialogActions>
    </Dialog>
    <ConfirmDialog
      open={Boolean(selected)}
      title={t('dialogs.queuedActionsDialog.removeAction')}
      message={t('dialogs.queuedActionsDialog.thisActionWillNotBeSyncedRemoveIt')}
      actionLabel={t('common.remove')}
      actionColor="error"
      pending={discarding}
      onClose={() => setSelected(null)}
      onConfirm={() => { if (selected) void onDiscard(selected.idempotencyKey).then((removed) => { if (removed) setSelected(null); }); }}
    />
  </>;
}
