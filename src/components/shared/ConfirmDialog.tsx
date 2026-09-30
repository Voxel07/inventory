import { Button } from './ActionButtons';
import { Dialog } from './ClosableDialog';
import type { ButtonProps } from '@mui/material';
import { DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { translate, useLocalizedText } from '../../utils/naming';

export interface ConfirmDialogProps {
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
  const t = useLocalizedText();
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button title={translate('Abbrechen und zum vorherigen Bildschirm zurückkehren', 'Cancel and return to the previous screen')} onClick={onClose} disabled={pending}>{t('Abbrechen', 'Cancel')}</Button>

        <Button title={actionTooltip ?? actionLabel} onClick={onConfirm} color={actionColor} variant="contained" disabled={pending}>
          {actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
