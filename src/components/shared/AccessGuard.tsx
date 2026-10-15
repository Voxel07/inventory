import { IconButton } from './ActionButtons';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { canAccessProcurement, canManageInventory, canManageUsers, canViewCatalog, canViewOrganization } from '../../utils/access';
import { useT } from '../../utils/naming';

export function InventoryManagerGuard({ children }: { children: ReactNode }) {
  const t = useT();
  const { user } = useAuth();
  if (!canManageInventory(user)) {
    return <Navigate to={canViewOrganization(user) ? '/orders?tab=faction' : '/items'} replace state={{ accessDenied: t('shared.accessGuard.accessDenied') }} />;
  }
  return children;
}

/** Organization data (orders, events, participants): read-only members and up; tenants go to their items. */
export function OrganizationGuard({ children }: { children: ReactNode }) {
  const t = useT();
  const { user } = useAuth();
  if (!canViewOrganization(user)) {
    return <Navigate to="/items" replace state={{ accessDenied: t('shared.accessGuard.accessDenied') }} />;
  }
  return children;
}

export function CatalogAccessGuard({ children }: { children: ReactNode }) {
  const t = useT();
  const { user } = useAuth();
  if (!canViewCatalog(user)) {
    return <Navigate to="/orders?tab=faction" replace state={{ accessDenied: t('shared.accessGuard.accessDenied') }} />;
  }
  return children;
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return canManageUsers(user) ? children : <Navigate to="/" replace />;
}

export function ProcurementGuard({ children }: { children: ReactNode }) {
  const t = useT();
  const { user } = useAuth();
  if (!canAccessProcurement(user)) {
    return <Navigate to="/" replace state={{ accessDenied: t('shared.accessGuard.accessDenied') }} />;
  }
  return children;
}

export function FactionAccessNotice() {
  const t = useT();
  const message = t('shared.accessGuard.youCanOnlyEditOrderListsOfYourAssignedFactions');
  return (
  <IconButton title={message} aria-label={message} color="info" size="small">
    <InfoOutlinedIcon fontSize="small" />
  </IconButton>
  );
}
