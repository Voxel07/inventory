import type { ButtonProps } from '@mui/material';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Tooltip } from '@mui/material';
import { useLocalizedText } from '../../utils/naming';

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
        <Button onClick={onClose} disabled={pending}>{t('Abbrechen', 'Cancel')}</Button>
        <Tooltip title={actionTooltip ?? actionLabel} arrow>
          <Button onClick={onConfirm} color={actionColor} variant="contained" disabled={pending}>
            {actionLabel}
          </Button>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}
