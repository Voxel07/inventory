import type { ReactNode } from 'react';
import { Dialog as MuiDialog, IconButton, type DialogProps } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useLocalizedText } from '../../utils/naming';

export function Dialog({ children, onClose, ...props }: DialogProps & { children?: ReactNode }) {
  const t = useLocalizedText();
  return (
    <MuiDialog onClose={onClose} {...props} sx={{
      '& .MuiDialog-paper': { position: 'relative' },
      '& .MuiDialogTitle-root': { paddingRight: 7 },
      ...props.sx,
    }}>
      <IconButton
        aria-label={t('Schließen', 'Close')}
        onClick={(event) => onClose?.(event, 'escapeKeyDown')}
        disabled={!onClose}
        sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}
      >
        <CloseIcon />
      </IconButton>
      {children}
    </MuiDialog>
  );
}
