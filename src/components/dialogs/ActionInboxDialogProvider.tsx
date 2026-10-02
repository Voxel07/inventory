import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { DialogContent, DialogTitle, LinearProgress } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { ActionInboxDialogContext } from '../../hooks/useActionInboxDialog';
import { useLocalizedText } from '../../utils/naming';

const ActionInboxContent = lazy(() => import('./ActionInboxContent').then((module) => ({ default: module.ActionInboxContent })));

export function ActionInboxDialogProvider({ children }: { children: ReactNode }) {
  const t = useLocalizedText();
  const [open, setOpen] = useState(false);
  const openActionInbox = useCallback(() => setOpen(true), []);
  const closeActionInbox = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openActionInbox, closeActionInbox }), [openActionInbox, closeActionInbox]);

  return <ActionInboxDialogContext.Provider value={value}>
    {children}
    <Dialog open={open} onClose={closeActionInbox} fullWidth maxWidth="md" aria-labelledby="action-inbox-title"
      slotProps={{ paper: { sx: { m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: undefined }, maxHeight: 'calc(100dvh - 48px)' } } }}>
      <DialogTitle id="action-inbox-title">{t('Aufgaben & Erinnerungen', 'Actions & reminders')}</DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 2 }, pb: 2 }}>
        {open && <Suspense fallback={<LinearProgress />}><ActionInboxContent onOpenTask={closeActionInbox} /></Suspense>}
      </DialogContent>
    </Dialog>
  </ActionInboxDialogContext.Provider>;
}
