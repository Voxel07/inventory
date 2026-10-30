import { DialogContent, DialogTitle } from '@mui/material';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { Dialog } from '../shared/ClosableDialog';
import { Button } from '../shared/ActionButtons';
import { OfflineStatusPanel } from '../operations/OfflineStatusPanel';
import { useT } from '../../utils/naming';

export function QueuedActionsDialog({ open, onClose, syncIssues, onReviewSyncIssues }: {
  open: boolean; onClose: () => void; syncIssues: number; onReviewSyncIssues: () => void;
}) {
  const t = useT();
  return <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>{t('dialogs.queuedActionsDialog.queuedActions')}</DialogTitle>
    <DialogContent dividers sx={{ p: 2 }}>
      {syncIssues > 0 && <Button fullWidth variant="contained" color="error" startIcon={<ReportProblemIcon />} onClick={onReviewSyncIssues} sx={{ mb: 2 }}>
        {t('shared.header.reviewSynchronizationConflicts')} ({syncIssues})
      </Button>}
      <OfflineStatusPanel />
    </DialogContent>
  </Dialog>;
}
