import { AppSnackbar } from './components/shared/AppSnackbar';
import { ActionInboxDialogProvider } from './components/dialogs/ActionInboxDialogProvider';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ThemeProvider, CssBaseline, Box, Toolbar, CircularProgress, Link, useMediaQuery, useTheme } from '@mui/material';
import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import { Header } from './components/shared/Header';
import { Navigation, DRAWER_WIDTH } from './components/shared/Navigation';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { AdminGuard, CatalogAccessGuard, InventoryManagerGuard, ProcurementGuard } from './components/shared/AccessGuard';
import { useAuth } from './hooks/useAuth';
import { useUIStore } from './store/uiStore';
import { useAppLanguage, translate, useLocalizedText } from './utils/naming';
import { subscribeToApiChanges } from './services/apiClient';
import { getSessionQueryClient, subscribeSessionQueryClient } from './services/sessionQueryClient';
import { createApiChangeCoalescer } from './utils/realtimeInvalidation';
import { useBarcodeScanner } from './hooks/useBarcodeScanner';
import { LoginPage } from './pages/LoginPage';
import { buildTheme } from './theme';

const Items = lazy(() => import('./pages/Items').then((m) => ({ default: m.Items })));
const ItemDetail = lazy(() => import('./pages/ItemDetail').then((m) => ({ default: m.ItemDetail })));
const AssetDetail = lazy(() => import('./pages/AssetDetail').then((m) => ({ default: m.AssetDetail })));
const Assemblies = lazy(() => import('./pages/Assemblies').then((m) => ({ default: m.Assemblies })));
const AssemblyDetail = lazy(() => import('./pages/AssemblyDetail').then((m) => ({ default: m.AssemblyDetail })));
const DamageReportsPage = lazy(() => import('./pages/DamageReports').then((m) => ({ default: m.DamageReportsPage })));
const CheckedOutItemsPage = lazy(() => import('./pages/CheckedOutItems').then((m) => ({ default: m.CheckedOutItemsPage })));
const ReturnedItemsPage = lazy(() => import('./pages/ReturnedItems').then((m) => ({ default: m.ReturnedItemsPage })));
const PrintQRCodesPage = lazy(() => import('./pages/PrintQRCodes').then((m) => ({ default: m.PrintQRCodesPage })));
const UserDashboard = lazy(() => import('./pages/UserDashboard').then((m) => ({ default: m.UserDashboard })));
const StorageLocations = lazy(() => import('./pages/StorageLocations').then((m) => ({ default: m.StorageLocations })));
const Events = lazy(() => import('./pages/Events').then((m) => ({ default: m.Events })));
const EventDetail = lazy(() => import('./pages/EventDetail').then((m) => ({ default: m.EventDetail })));
const Orders = lazy(() => import('./pages/Orders').then((m) => ({ default: m.Orders })));
const FactionOrderDetail = lazy(() => import('./pages/FactionOrderDetail').then((m) => ({ default: m.FactionOrderDetail })));
const UserManagement = lazy(() => import('./pages/UserManagement').then((m) => ({ default: m.UserManagement })));
const TransactionHistoryPage = lazy(() => import('./pages/TransactionHistory').then((m) => ({ default: m.TransactionHistoryPage })));
const Procurement = lazy(() => import('./pages/Procurement').then((m) => ({ default: m.Procurement })));
const Maintenance = lazy(() => import('./pages/Maintenance').then((m) => ({ default: m.Maintenance })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const LocationScan = lazy(() => import('./pages/LocationScan').then(m => ({ default: m.LocationScan })));
const Operations = lazy(() => import('./pages/Operations').then((m) => ({ default: m.Operations })));

function RouteLoadingFallback() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
      <CircularProgress size={36} />
    </Box>
  );
}

function AppContent() {
  useAppLanguage();
  const { isAuthenticated } = useAuth();
  useBarcodeScanner(isAuthenticated);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const theme = useTheme();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile, setSidebarOpen]);

  useEffect(() => {
    const coalescer = createApiChangeCoalescer(queryClient);
    const unsubscribe = subscribeToApiChanges((detail) => coalescer.push(detail));
    return () => { unsubscribe(); coalescer.dispose(); };
  }, [queryClient]);

  useEffect(() => {
    const onRateLimited = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; retryAfterSeconds?: number }>).detail ?? {};
      const retry = detail.retryAfterSeconds ? ` (${detail.retryAfterSeconds}s)` : '';
      useUIStore.getState().showSnackbar(
        translate(`Zu viele Anfragen — kurz warten${retry}`, `Too many requests — try again shortly${retry}`),
        'warning',
      );
    };
    window.addEventListener('ash-api-rate-limited', onRateLimited);
    return () => window.removeEventListener('ash-api-rate-limited', onRateLimited);
  }, []);

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <AppSnackbar />
      </>
    );
  }

  return (
    <ActionInboxDialogProvider><Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <SkipLink />
      <Header />
      <Navigation />
      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{
          flexGrow: 1,
          px: { xs: 2, md: 3, lg: 4 },
          py: { xs: 2, md: 3 },
          pb: { xs: 'calc(88px + env(safe-area-inset-bottom))', md: 4 },
          '&:focus': { outline: 'none' },
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
          <Suspense fallback={<RouteLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/global-dashboard" element={<Navigate to="/?scope=team" replace />} />
              <Route path="/items" element={<CatalogAccessGuard><Items /></CatalogAccessGuard>} />
              <Route path="/items/:itemId" element={<CatalogAccessGuard><ItemDetail /></CatalogAccessGuard>} />
              <Route path="/items/:itemId/assets/:assetId" element={<CatalogAccessGuard><AssetDetail /></CatalogAccessGuard>} />
              <Route path="/assemblies" element={<CatalogAccessGuard><Assemblies /></CatalogAccessGuard>} />
              <Route path="/assemblies/:assemblyId" element={<CatalogAccessGuard><AssemblyDetail /></CatalogAccessGuard>} />
              <Route path="/events" element={<InventoryManagerGuard><Events /></InventoryManagerGuard>} />
              <Route path="/events/:reportId" element={<InventoryManagerGuard><EventDetail /></InventoryManagerGuard>} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/faction/:orderId" element={<FactionOrderDetail />} />
              <Route path="/checked-out" element={<InventoryManagerGuard><CheckedOutItemsPage /></InventoryManagerGuard>} />
              <Route path="/returns" element={<InventoryManagerGuard><ReturnedItemsPage /></InventoryManagerGuard>} />
              <Route path="/transactions" element={<InventoryManagerGuard><TransactionHistoryPage /></InventoryManagerGuard>} />
              <Route path="/print-qr" element={<InventoryManagerGuard><PrintQRCodesPage /></InventoryManagerGuard>} />
              <Route path="/damage-reports" element={<InventoryManagerGuard><DamageReportsPage /></InventoryManagerGuard>} />
              <Route path="/procurement" element={<ProcurementGuard><Procurement /></ProcurementGuard>} />
              <Route path="/maintenance" element={<InventoryManagerGuard><Maintenance /></InventoryManagerGuard>} />
              <Route path="/locations/:locationId" element={<LocationScan />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/storage-locations" element={<CatalogAccessGuard><StorageLocations /></CatalogAccessGuard>} />
              <Route path="/operations" element={<InventoryManagerGuard><Operations /></InventoryManagerGuard>} />
              <Route path="/users" element={<AdminGuard><UserManagement /></AdminGuard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Box>
      <AppSnackbar />
    </Box></ActionInboxDialogProvider>
  );
}

/** Visible on keyboard focus so keyboard users can bypass the header and navigation. */
function SkipLink() {
  const t = useLocalizedText();
  return (
    <Link href="#main-content" className="no-print" sx={{
      position: 'fixed', left: 8, top: 8, zIndex: (theme) => theme.zIndex.tooltip + 1,
      px: 2, py: 1.25, borderRadius: 1, bgcolor: 'background.paper', color: 'primary.main', fontWeight: 600,
      boxShadow: 3, transform: 'translateY(-200%)', '&:focus': { transform: 'none' },
    }}>
      {t('Zum Inhalt springen', 'Skip to content')}
    </Link>
  );
}

function HomeRoute() {
  return <UserDashboard />;
}

export default function App() {
  const queryClient = useSyncExternalStore(subscribeSessionQueryClient, getSessionQueryClient, getSessionQueryClient);
  const { generation } = useAuth();
  return (
    <QueryClientProvider key={generation} client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  );
}

function ThemedApp() {
  useAppLanguage();
  const themeMode = useUIStore((s) => s.themeMode);
  const theme = buildTheme(themeMode);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}
