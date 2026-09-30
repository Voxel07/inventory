import { Alert, Snackbar } from '@mui/material';
import { useUIStore } from '../../store/uiStore';

export function AppSnackbar() {
  const snackbar = useUIStore((state) => state.snackbar);
  const hideSnackbar = useUIStore((state) => state.hideSnackbar);

  return <Snackbar
    open={snackbar.open}
    autoHideDuration={4000}
    onClose={hideSnackbar}
    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    sx={{ bottom: { xs: 80, md: 24 }, left: { xs: 12, sm: 'auto' }, right: { xs: 12, sm: 24 } }}
  >
    <Alert onClose={hideSnackbar} severity={snackbar.severity} variant="filled" sx={{
      width: 'auto', maxWidth: 360, minWidth: 0, ml: 'auto', px: 1.25, py: 0.5,
      alignItems: 'center', fontSize: '0.8125rem', lineHeight: 1.4,
      '& .MuiAlert-icon': { mr: 1, py: 0, fontSize: 20 },
      '& .MuiAlert-message': { py: 0.5, minWidth: 0, overflowWrap: 'anywhere' },
      '& .MuiAlert-action': { pl: 0.5, mr: -0.5, pt: 0, alignItems: 'center' },
    }}>
      {snackbar.message}
    </Alert>
  </Snackbar>;
}
