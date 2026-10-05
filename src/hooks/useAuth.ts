import { useSyncExternalStore } from 'react';
import { getAuthSnapshot, login, logout, subscribeAuth } from '../services/apiClient';

export function useAuth() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
  return {
    generation: auth.generation,
    token: auth.token,
    user: auth.user,
    error: auth.error,
    isAuthenticated: Boolean(auth.token && auth.user),
    login,
    logout,
  };
}

