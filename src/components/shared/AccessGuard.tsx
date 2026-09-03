import { Alert } from '@mui/material';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { canManageInventory } from '../../utils/access';
import type { User } from '../../types';
import { useTranslate } from '../../utils/naming';

export function InventoryManagerGuard({ children }: { children: ReactNode }) {
  const t = useTranslate();
  const { user } = useAuth();
  if (!canManageInventory(user as unknown as User)) {
    return <Navigate to="/orders?tab=faction" replace state={{ accessDenied: t('Zugriff verweigert', 'Access denied') }} />;
  }
  return children;
}

export function FactionAccessNotice() {
  const t = useTranslate();
  return <Alert severity="info">{t('Sie sehen nur Bestelllisten Ihrer zugewiesenen Fraktionen.', 'You only see order lists for your assigned factions.')}</Alert>;
}
