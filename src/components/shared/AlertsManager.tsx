import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Alert, Box, Portal, Slide, Stack, Toolbar, useMediaQuery, type AlertColor } from '@mui/material';
import { keyframes } from '@emotion/react';

const DURATION_MS: Record<AlertColor, number> = { error: 8000, warning: 6000, info: 4000, success: 4000 };
const MAX_ALERTS = 5;
const countdown = keyframes`from { transform: scaleX(1); } to { transform: scaleX(0); }`;

export interface AlertsManagerHandle {
  showAlert: (severity: AlertColor, message: string) => void;
}

interface ManagedAlert {
  id: number;
  severity: AlertColor;
  message: string;
}

function AlertItem({ alert, onRemove }: { alert: ManagedAlert; onRemove: (id: number) => void }) {
  const { id, severity, message } = alert;
  const duration = DURATION_MS[severity];
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  // Each mounted alert owns its timer, including cleanup when the stack evicts it.
  useEffect(() => {
    const timer = window.setTimeout(() => onRemove(id), duration);
    return () => window.clearTimeout(timer);
  }, [id, duration, onRemove]);

  return (
    <Slide direction="left" in timeout={reduceMotion ? 0 : undefined} mountOnEnter unmountOnExit>
      <Box sx={{
        position: 'relative', overflow: 'hidden', borderRadius: 1.5,
        bgcolor: 'background.paper', border: 1, borderColor: 'divider',
        boxShadow: 3, pointerEvents: 'auto', flexShrink: 0,
      }}>
        <Alert severity={severity} onClose={() => onRemove(id)} sx={{
          borderRadius: 'inherit', px: 1.5, py: 1, fontSize: '0.875rem', lineHeight: 1.5,
          '& .MuiAlert-icon': { mr: 1, flexShrink: 0 },
          '& .MuiAlert-message': { minWidth: 0, overflowWrap: 'anywhere' },
          '& .MuiAlert-action': { flexShrink: 0, pl: 1 },
        }}>
          {message}
        </Alert>
        <Box aria-hidden="true" sx={{
          position: 'absolute', bottom: 0, left: 0, width: '100%', height: 3,
          bgcolor: `${severity}.main`, transformOrigin: 'left',
          animation: `${countdown} ${duration}ms linear forwards`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }} />
      </Box>
    </Slide>
  );
}

export function AlertsManager({ ref }: { ref: Ref<AlertsManagerHandle> }) {
  const [alerts, setAlerts] = useState<ManagedAlert[]>([]);
  const nextId = useRef(0);
  const removeAlert = useCallback((id: number) => {
    setAlerts((previous) => previous.filter((alert) => alert.id !== id));
  }, []);
  const showAlert = useCallback((severity: AlertColor, message: string) => {
    const id = ++nextId.current;
    setAlerts((previous) => [...previous, { id, severity, message }].slice(-MAX_ALERTS));
  }, []);

  useImperativeHandle(ref, () => ({ showAlert }), [showAlert]);

  return (
    <Portal>
      <Box className="no-print" sx={{
        position: 'fixed', top: 0, right: 'env(safe-area-inset-right, 0px)',
        bottom: { xs: 'calc(80px + env(safe-area-inset-bottom, 0px))', md: 16 },
        width: { xs: 'calc(100% - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))', sm: 416 },
        maxWidth: '100%', zIndex: (theme) => theme.zIndex.snackbar,
        display: 'flex', flexDirection: 'column', pointerEvents: 'none',
        visibility: alerts.length ? 'visible' : 'hidden',
      }}>
        {/* Match the header's responsive toolbar height, including phone landscape. */}
        <Toolbar aria-hidden="true" sx={{ flexShrink: 0 }} />
        <Stack spacing={1} aria-live="polite" aria-relevant="additions text" sx={{
          minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          px: { xs: 1.5, sm: 2 }, pt: 1.5, pb: 2,
        }}>
          {alerts.map((alert) => <AlertItem key={alert.id} alert={alert} onRemove={removeAlert} />)}
        </Stack>
      </Box>
    </Portal>
  );
}
