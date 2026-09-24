import { Alert } from '@mui/material';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { canAccessProcurement, canManageInventory, canViewCatalog } from '../../utils/access';
import { useLocalizedText } from '../../utils/naming';

export function InventoryManagerGuard({ children }: { children: ReactNode }) {
  const t = useLocalizedText();
  const { user } = useAuth();
  if (!canManageInventory(user)) {
    return <Navigate to="/orders?tab=faction" replace state={{ accessDenied: t('Zugriff verweigert', 'Access denied') }} />;
  }
  return children;
}

export function CatalogAccessGuard({ children }: { children: ReactNode }) {
  const t = useLocalizedText();
  const { user } = useAuth();
  if (!canViewCatalog(user)) {
    return <Navigate to="/orders?tab=faction" replace state={{ accessDenied: t('Zugriff verweigert', 'Access denied') }} />;
  }
  return children;
}

export function ProcurementGuard({ children }: { children: ReactNode }) {
  const t = useLocalizedText();
  const { user } = useAuth();
  if (!canAccessProcurement(user)) {
    return <Navigate to="/" replace state={{ accessDenied: t('Zugriff verweigert', 'Access denied') }} />;
  }
  return children;
}

export function FactionAccessNotice() {
  const t = useLocalizedText();
  return <Alert severity="info">{t('Sie sehen nur Bestelllisten Ihrer zugewiesenen Fraktionen.', 'You only see order lists for your assigned factions.')}</Alert>;
}
