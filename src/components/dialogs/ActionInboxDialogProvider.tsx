import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { DialogContent, DialogTitle, LinearProgress, useMediaQuery, useTheme } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { ActionInboxDialogContext } from '../../hooks/useActionInboxDialog';
import { useLocalizedText } from '../../utils/naming';

const ActionInboxContent = lazy(() => import('./ActionInboxContent').then((module) => ({ default: module.ActionInboxContent })));

export function ActionInboxDialogProvider({ children }: { children: ReactNode }) {
  const t = useLocalizedText();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);
  const openActionInbox = useCallback(() => setOpen(true), []);
  const closeActionInbox = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openActionInbox, closeActionInbox }), [openActionInbox, closeActionInbox]);

  return <ActionInboxDialogContext.Provider value={value}>
    {children}
    <Dialog open={open} onClose={closeActionInbox} fullWidth maxWidth="md" fullScreen={fullScreen} aria-labelledby="action-inbox-title">
      <DialogTitle id="action-inbox-title">{t('Posteingang', 'Inbox')}</DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
        {open && <Suspense fallback={<LinearProgress />}><ActionInboxContent onOpenTask={closeActionInbox} /></Suspense>}
      </DialogContent>
    </Dialog>
  </ActionInboxDialogContext.Provider>;
}
