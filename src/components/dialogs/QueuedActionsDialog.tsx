import { DialogContent, DialogTitle } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { OfflineStatusPanel } from '../operations/OfflineStatusPanel';
import { useT } from '../../utils/naming';

export function QueuedActionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>{t('dialogs.queuedActionsDialog.queuedActions')}</DialogTitle>
    <DialogContent dividers sx={{ p: 2 }}>
      <OfflineStatusPanel />
    </DialogContent>
  </Dialog>;
}
