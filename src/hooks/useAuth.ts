import { useSyncExternalStore } from 'react';
import { getAuthSnapshot, login, logout, subscribeAuth } from '../services/apiClient';
import { DEV_LOGIN_AVAILABLE } from '../config/runtimeConfig';

export function useAuth() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
  const admin = auth.impersonator ?? auth.user;
  const canPreviewRoles = DEV_LOGIN_AVAILABLE && auth.token.startsWith('dev:') && admin?.role === 'admin'
    && (!auth.impersonator || auth.user?.id === admin.id);
  return {
    generation: auth.generation,
    token: auth.token,
    user: auth.user,
    impersonator: auth.impersonator,
    canPreviewRoles,
    isRolePreview: canPreviewRoles && Boolean(auth.impersonator),
    isSwitchingUser: auth.isSwitchingUser,
    error: auth.error,
    isAuthenticated: Boolean(auth.token && auth.user),
    login,
    logout,
  };
}

