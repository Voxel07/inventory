import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { OIDC_AUTHORITY } from '../config';
import { useInventory } from '../inventoryContext';
import { styles } from '../theme';
import { Button, Card, Screen } from '../ui';

export default function Login() {
  const router = useRouter();
  const { ready, session, login, busy } = useInventory();
  const [error, setError] = useState('');
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  if (session) return <Redirect href="/" />;
  return <Screen title="Sign in"><Card>
    <Text style={styles.body}>Sign in to download the inventory catalog. After that, your saved catalog and pending scans remain available offline.</Text>
    <Button title={busy ? 'Signing in…' : OIDC_AUTHORITY ? 'Sign in with Authentik' : 'Development sign in'} disabled={busy} onPress={() => {
      void login().then(() => router.replace('/')).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-in failed.'));
    }} />
    {!!error && <Text style={{ color: '#b42318' }}>{error}</Text>}
  </Card></Screen>;
}
