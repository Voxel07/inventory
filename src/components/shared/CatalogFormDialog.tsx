import type { ReactNode } from 'react';
import { DialogContent, DialogTitle } from '@mui/material';
import { Dialog } from './ClosableDialog';

export function CatalogFormDialog({ open, title, onClose, fullScreen, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  fullScreen: boolean;
  children: ReactNode;
}) {
  return <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent sx={{ pt: 2, overflow: 'visible' }}>{children}</DialogContent>
  </Dialog>;
}
