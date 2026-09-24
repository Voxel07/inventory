import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useInventory } from '../inventoryContext';
import { colors, styles } from '../theme';
import { Button, Card, Field, Screen } from '../ui';

export default function Home() {
  const router = useRouter();
  const { ready, session, items, refresh, busy, logout } = useInventory();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => items.filter((item) => `${item.name} ${item.sku || ''} ${item.barcode || ''}`.toLowerCase().includes(query.toLowerCase())), [items, query]);
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  if (!session) return <Redirect href="/login" />;
  return <Screen title="Inventory">
    <View style={styles.row}><Button title="Scan QR / barcode" onPress={() => router.push('/scan')} /><Button title={busy ? 'Refreshing…' : 'Refresh catalog'} secondary disabled={busy} onPress={() => void refresh()} /></View>
    <Card><Text style={styles.section}>Catalog</Text><Text style={styles.muted}>{items.length} items saved on this device</Text><Field label="Find an item" placeholder="Name, SKU or barcode" value={query} onChangeText={setQuery} autoCapitalize="none" /></Card>
    <FlatList scrollEnabled={false} data={visible} keyExtractor={(item) => item.id} ListEmptyComponent={<Text style={styles.muted}>No matching items. Connect and refresh to download the catalog.</Text>} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push(`/item/${item.id}`)} style={{ backgroundColor: colors.white, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.line, marginBottom: 8 }}>
      <Text style={[styles.body, { fontWeight: '700' }]}>{item.name}</Text><Text style={styles.muted}>{item.sku || item.category || 'Item'} · Available {item.stock?.available ?? '—'}</Text>
    </Pressable>} />
    <Button title="Sync status" secondary onPress={() => router.push('/sync')} />
    <Button title="Sign out" secondary onPress={() => { void logout().then(() => router.replace('/login')); }} />
  </Screen>;
}
