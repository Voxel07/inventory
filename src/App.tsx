import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme, CssBaseline, Box, Toolbar, Snackbar, Alert, Chip, useMediaQuery } from '@mui/material';
import { Header } from './components/shared/Header';
import { Navigation, DRAWER_WIDTH } from './components/shared/Navigation';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { Items } from './pages/Items';
import { ItemDetail } from './pages/ItemDetail';
import { Assemblies } from './pages/Assemblies';
import { AssemblyDetail } from './pages/AssemblyDetail';
import { QRCheckout } from './pages/QRCheckout';
import { TransactionHistoryPage } from './pages/TransactionHistory';
import { DamageReportsPage } from './pages/DamageReports';
import { CheckedOutItemsPage } from './pages/CheckedOutItems';
import { PrintQRCodesPage } from './pages/PrintQRCodes';
import { UserDashboard } from './pages/UserDashboard';
import { StorageLocations } from './pages/StorageLocations';
import { Events } from './pages/Events';
import { FactionOrders } from './pages/FactionOrders';
import { FactionOrderDetail } from './pages/FactionOrderDetail';
import { LoginPage } from './pages/LoginPage';
import { usePocketBase } from './hooks/usePocketBase';
import { useUIStore } from './store/uiStore';
import { useEffect } from 'react';
import { useAppLanguage } from './utils/naming';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

function VersionedAlert({
  message,
  severity,
  onClose,
}: {
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
  onClose: () => void;
}) {
  return (
    <Alert onClose={onClose} severity={severity} variant="filled" sx={{ borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Box component="span">{message}</Box>
        <Chip
          component="span"
          label={__APP_VERSION__}
          size="small"
          variant="outlined"
          aria-label={`Version ${__APP_VERSION__}`}
          sx={{
            height: 22,
            color: 'inherit',
            borderColor: 'currentColor',
            opacity: 0.82,
            '& .MuiChip-label': {
              px: 0.75,
              fontFamily: 'monospace',
              fontSize: '0.68rem',
              letterSpacing: '0.02em',
            },
          }}
        />
      </Box>
    </Alert>
  );
}

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#e30613',
      dark: '#b8000a',
      light: '#ff3340',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#0e0e0f',
      dark: '#000000',
      light: '#333333',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f4f5f6',
      paper: '#ffffff',
    },
    text: {
      primary: '#0e0e0f',
      secondary: '#656e85',
    },
    divider: '#e2e4e9',
    success: { main: '#5f8068' },
    warning: { main: '#b66a00' },
    error: { main: '#d12222' },
  },
  typography: {
    fontFamily: '"Titillium Web", "Inter", "Helvetica", "Arial", sans-serif',
    h4: {
      fontFamily: '"Big Shoulders Display", Impact, "Arial Narrow", sans-serif',
      fontWeight: 800,
      letterSpacing: '0.025em',
      lineHeight: 1.05,
      textTransform: 'uppercase',
    },
    h5: {
      fontFamily: '"Big Shoulders Display", Impact, "Arial Narrow", sans-serif',
      fontWeight: 800,
      letterSpacing: '0.02em',
      lineHeight: 1.1,
      textTransform: 'uppercase',
    },
    h6: {
      fontFamily: '"Big Shoulders Display", Impact, "Arial Narrow", sans-serif',
      fontWeight: 700,
      letterSpacing: '0.025em',
    },
    button: {
      fontWeight: 700,
      letterSpacing: '0.055em',
    },
  },
  shape: {
    borderRadius: 3,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#f4f5f6',
          backgroundImage: 'linear-gradient(135deg, rgba(14, 14, 15, 0.018) 25%, transparent 25%, transparent 75%, rgba(14, 14, 15, 0.018) 75%)',
          backgroundSize: '28px 28px',
        },
        '::selection': {
          backgroundColor: '#e30613',
          color: '#ffffff',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid #e2e4e9',
          boxShadow: '0 1px 2px rgba(14, 14, 15, 0.035)',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 2,
          textTransform: 'uppercase',
          fontWeight: 700,
          letterSpacing: '0.055em',
          minHeight: 38,
          '@media (max-width: 599.95px)': { minHeight: 44 },
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        outlined: {
          borderWidth: 1,
          '&:hover': { borderWidth: 1 },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          '@media (max-width: 599.95px)': { minWidth: 44, minHeight: 44 },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          fontWeight: 700,
          letterSpacing: '0.025em',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#e2e4e9',
        },
        head: {
          backgroundColor: '#0e0e0f',
          color: '#ffffff',
          fontFamily: '"Big Shoulders Display", Impact, "Arial Narrow", sans-serif',
          fontWeight: 700,
          letterSpacing: '0.055em',
          textTransform: 'uppercase',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: 'rgba(227, 6, 19, 0.045)',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          backgroundColor: '#ffffff',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#cfd2d8' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#0e0e0f' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#e30613',
            borderWidth: 2,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': { color: '#b8000a' },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: '1px solid #e2e4e9',
          borderTop: '4px solid #e30613',
          boxShadow: '0 18px 60px rgba(0, 0, 0, 0.22)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#0e0e0f',
          color: '#ffffff',
          border: 0,
          borderBottom: '2px solid #e30613',
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0e0e0f',
          color: '#ffffff',
          border: 0,
          borderRight: '1px solid #292a2d',
          boxShadow: 'none',
          '& .MuiListItemIcon-root': { color: 'rgba(255, 255, 255, 0.68)' },
          '& .MuiListItemButton-root:hover': { backgroundColor: 'rgba(255, 255, 255, 0.07)' },
          '& .MuiDivider-root': { borderColor: 'rgba(255, 255, 255, 0.14)' },
        },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          backgroundColor: '#0e0e0f',
          color: 'rgba(255, 255, 255, 0.68)',
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: {
          color: 'rgba(255, 255, 255, 0.68)',
          '&.Mui-selected': { color: '#ffffff' },
          '&.Mui-selected::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: '24%',
            right: '24%',
            height: 3,
            backgroundColor: '#e30613',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, backgroundColor: '#e30613' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          letterSpacing: '0.045em',
          textTransform: 'uppercase',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 2 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 2,
          backgroundColor: '#0e0e0f',
          fontSize: '0.75rem',
        },
      },
    },
  },
});

function AppContent() {
  useAppLanguage();
  const { isAuthenticated } = usePocketBase();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const snackbar = useUIStore((s) => s.snackbar);
  const hideSnackbar = useUIStore((s) => s.hideSnackbar);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, setSidebarOpen]);

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={hideSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{ bottom: { xs: 80, md: 24 } }}
        >
          <VersionedAlert message={snackbar.message} severity={snackbar.severity} onClose={hideSnackbar} />
        </Snackbar>
      </>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Header />
      <Navigation />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          pb: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 3 },
          width: !isMobile && sidebarOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%',
          transition: (theme) => theme.transitions.create('width', {
            easing: !isMobile && sidebarOpen ? theme.transitions.easing.easeOut : theme.transitions.easing.sharp,
            duration: !isMobile && sidebarOpen ? theme.transitions.duration.enteringScreen : theme.transitions.duration.leavingScreen,
          }),
          maxWidth: '100%',
          overflowX: 'hidden',
        }}
      >
        <Toolbar />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<UserDashboard />} />
            <Route path="/global-dashboard" element={<Dashboard />} />
            <Route path="/items" element={<Items />} />
            <Route path="/items/:itemId" element={<ItemDetail />} />
            <Route path="/assemblies" element={<Assemblies />} />
            <Route path="/assemblies/:assemblyId" element={<AssemblyDetail />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/orders" element={<FactionOrders />} />
            <Route path="/events/orders/:orderId" element={<FactionOrderDetail />} />
            <Route path="/checkout" element={<QRCheckout />} />
            <Route path="/checkout/:itemId" element={<QRCheckout />} />
            <Route path="/transactions" element={<TransactionHistoryPage />} />
            <Route path="/checked-out" element={<CheckedOutItemsPage />} />
            <Route path="/print-qr" element={<PrintQRCodesPage />} />
            <Route path="/damage-reports" element={<DamageReportsPage />} />
            <Route path="/storage-locations" element={<StorageLocations />} />
          </Routes>
        </ErrorBoundary>
      </Box>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={hideSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ bottom: { xs: 80, md: 24 } }}
      >
        <VersionedAlert message={snackbar.message} severity={snackbar.severity} onClose={hideSnackbar} />
      </Snackbar>
    </Box>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
