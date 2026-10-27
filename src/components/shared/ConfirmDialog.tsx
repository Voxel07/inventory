import { Button } from './ActionButtons';
import { Dialog } from './ClosableDialog';
import type { ButtonProps } from '@mui/material';
import { DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { translate, useT } from '../../utils/naming';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  actionLabel: string;
  actionTooltip?: string;
  actionColor?: ButtonProps['color'];
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  actionLabel,
  actionTooltip,
  actionColor = 'primary',
  onClose,
  onConfirm,
  pending = false,
}: ConfirmDialogProps) {
  const t = useT();
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button title={translate('shared.confirmDialog.cancelAndReturnToThePreviousScreen')} onClick={onClose} disabled={pending}>{t('common.cancel')}</Button>

        <Button title={actionTooltip ?? actionLabel} onClick={onConfirm} color={actionColor} variant="contained" disabled={pending}>
          {actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
