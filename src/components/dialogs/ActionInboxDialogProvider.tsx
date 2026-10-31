import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { DialogContent, DialogTitle, LinearProgress, useMediaQuery, useTheme } from '@mui/material';
import { Dialog } from '../shared/ClosableDialog';
import { ActionInboxDialogContext } from '../../hooks/useActionInboxDialog';
import { useT } from '../../utils/naming';
import { BOTTOM_NAV_HEIGHT } from '../shared/Navigation';

const ActionInboxContent = lazy(() => import('./ActionInboxContent').then((module) => ({ default: module.ActionInboxContent })));

export function ActionInboxDialogProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const hasBottomNav = useMediaQuery(theme.breakpoints.down('md'));
  // Phones keep the bottom bar visible and usable below the inbox.
  const aboveBottomNav = hasBottomNav ? { bottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))` } : undefined;
  const [open, setOpen] = useState(false);
  const openActionInbox = useCallback(() => setOpen(true), []);
  const closeActionInbox = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openActionInbox, closeActionInbox }), [openActionInbox, closeActionInbox]);

  return <ActionInboxDialogContext.Provider value={value}>
    {children}
    <Dialog open={open} onClose={closeActionInbox} fullWidth maxWidth="md" fullScreen={fullScreen} aria-labelledby="action-inbox-title"
      sx={aboveBottomNav} disableEnforceFocus={hasBottomNav} slotProps={{ backdrop: { sx: aboveBottomNav } }}>
      <DialogTitle id="action-inbox-title">{t('dialogs.actionInboxDialogProvider.inbox')}</DialogTitle>
      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
        {open && <Suspense fallback={<LinearProgress />}><ActionInboxContent onOpenTask={closeActionInbox} /></Suspense>}
      </DialogContent>
    </Dialog>
  </ActionInboxDialogContext.Provider>;
}
