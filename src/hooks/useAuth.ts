import { useEffect, useSyncExternalStore } from 'react';
import { getAuthSnapshot, login, logout, refreshCurrentUser, subscribeAuth } from '../services/apiClient';

export function useAuth() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
  return {
    token: auth.token,
    user: auth.user,
    isAuthenticated: Boolean(auth.token && auth.user),
    login,
    logout,
  };
}

export function useCurrentUserRefresh() {
  const { token } = useAuth();
  useEffect(() => {
    if (!token) return;
    const refresh = () => void refreshCurrentUser();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [token]);
}
