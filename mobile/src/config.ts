import { Platform } from 'react-native';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' ? 'http://localhost:8080' : '')).replace(/\/$/, '');
export const OIDC_AUTHORITY = (process.env.EXPO_PUBLIC_OIDC_AUTHORITY || '').replace(/\/$/, '');
export const OIDC_CLIENT_ID = process.env.EXPO_PUBLIC_OIDC_CLIENT_ID || '';

export function checkConfig(): string | null {
  if (!API_URL || !/^https?:\/\//.test(API_URL)) return 'Set EXPO_PUBLIC_API_URL to a URL reachable from this device.';
  if (Boolean(OIDC_AUTHORITY) !== Boolean(OIDC_CLIENT_ID)) return 'Set both EXPO_PUBLIC_OIDC_AUTHORITY and EXPO_PUBLIC_OIDC_CLIENT_ID.';
  return null;
}
