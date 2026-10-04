import { useId, type FormEvent, type ReactNode } from 'react';
import { Alert, Box, DialogActions, DialogContent, DialogTitle, Stack, Typography, useMediaQuery, useTheme, type DialogProps } from '@mui/material';
import { Dialog } from './ClosableDialog';
import { Button } from './ActionButtons';
import { useLocalizedText } from '../../utils/naming';

/**
 * The one dialog shell for forms: full screen on phones, otherwise a centred
 * panel. Content is a `DialogForm`, so a form component owns its own state and
 * remounts each time the dialog opens.
 */
export function FormDialog({ open, onClose, children, maxWidth = 'sm' }: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: DialogProps['maxWidth'];
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  return <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth={maxWidth} fullWidth>{children}</Dialog>;
}

/**
 * Title and close stay at the top, the body scrolls on its own, and Cancel/Save
 * stay reachable at the bottom while editing long forms.
 */
export function DialogForm({ title, onSubmit, onCancel, submitLabel, submitDisabled, pending, error, children, extraActions, noValidate = false }: {
  title: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  pending?: boolean;
  error?: string | null;
  children: ReactNode;
  extraActions?: ReactNode;
  /** Opt out of native constraint validation when the form validates itself. */
  noValidate?: boolean;
}) {
  const t = useLocalizedText();
  function submit(event: FormEvent) {
    event.preventDefault();
    // Nested dialogs are portaled, but React still bubbles their submit events.
    event.stopPropagation();
    if (!submitDisabled && !pending) onSubmit();
  }
  return <Box component="form" noValidate={noValidate} onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: '1 1 auto' }}>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 2.5, scrollPaddingBottom: 24 }}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {children}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1, pb: { xs: 'calc(12px + env(safe-area-inset-bottom))', sm: 1.5 } }}>
      {extraActions && <Box sx={{ mr: 'auto' }}>{extraActions}</Box>}
      <Button onClick={onCancel} disabled={pending}>{t('Abbrechen', 'Cancel')}</Button>
      <Button type="submit" variant="contained" disabled={submitDisabled || pending}>{submitLabel ?? t('Speichern', 'Save')}</Button>
    </DialogActions>
  </Box>;
}

/** A labelled group of related fields inside a `DialogForm`. */
export function FormSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <Stack role="group" aria-labelledby={id} spacing={2} sx={{ minWidth: 0, '& + &': { pt: 2.5, borderTop: 1, borderColor: 'divider' } }}>
    <Box>
      <Typography id={id} variant="subtitle2">{title}</Typography>
      {description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{description}</Typography>}
    </Box>
    {children}
  </Stack>;
}
