import { IconButton } from './ActionButtons';
import type { ReactNode } from 'react';
import { Dialog as MuiDialog, type DialogProps } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { translate, useLocalizedText } from '../../utils/naming';

export function Dialog({ children, onClose, ...props }: DialogProps & { children?: ReactNode }) {
  const t = useLocalizedText();
  return (
    <MuiDialog onClose={onClose} {...props} sx={{
      '& .MuiDialog-paper': { position: 'relative' },
      '& .MuiDialogTitle-root': { paddingRight: 7 },
      ...props.sx,
    }}>
      <IconButton title={translate('Diesen Dialog schließen', 'Close this dialog')}
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
