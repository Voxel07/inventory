import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme, CssBaseline, Box, Toolbar, Snackbar, Alert, useMediaQuery } from '@mui/material';
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
import { useUIStore } from './store/uiStore';
import { useEffect } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7c4dff' },
    secondary: { main: '#ff4081' },
    background: {
      default: '#0a0e14',
      paper: '#131920',
    },
    divider: 'rgba(255, 255, 255, 0.08)',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: '1px solid rgba(255, 255, 255, 0.08)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#0d1117',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#0d1117',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        },
      },
    },
  },
});

function AppContent() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const snackbar = useUIStore((s) => s.snackbar);
  const hideSnackbar = useUIStore((s) => s.hideSnackbar);
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, setSidebarOpen]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Header />
      <Navigation />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: !isMobile && sidebarOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%',
          ml: !isMobile && sidebarOpen ? `${DRAWER_WIDTH}px` : 0,
          transition: 'margin 225ms cubic-bezier(0, 0, 0.2, 1), width 225ms cubic-bezier(0, 0, 0.2, 1)',
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        <Toolbar />
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/items" element={<Items />} />
            <Route path="/items/:itemId" element={<ItemDetail />} />
            <Route path="/assemblies" element={<Assemblies />} />
            <Route path="/assemblies/:assemblyId" element={<AssemblyDetail />} />
            <Route path="/checkout" element={<QRCheckout />} />
            <Route path="/checkout/:itemId" element={<QRCheckout />} />
            <Route path="/transactions" element={<TransactionHistoryPage />} />
            <Route path="/checked-out" element={<CheckedOutItemsPage />} />
            <Route path="/print-qr" element={<PrintQRCodesPage />} />
            <Route path="/damage-reports" element={<DamageReportsPage />} />
          </Routes>
        </ErrorBoundary>
      </Box>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={hideSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={hideSnackbar} severity={snackbar.severity} variant="filled" sx={{ borderRadius: 2 }}>
          {snackbar.message}
        </Alert>
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
