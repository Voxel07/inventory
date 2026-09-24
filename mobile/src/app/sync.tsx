import { useState } from 'react';
import { Text } from 'react-native';
import { useInventory } from '../inventoryContext';
import { styles } from '../theme';
import { Button, Card, Screen } from '../ui';

export default function SyncStatus() {
  const { online, queued, issues, synchronize, discard } = useInventory();
  const [working, setWorking] = useState(false);
  return <Screen title="Offline & sync" back>
    <Card><Text style={styles.section}>{online ? 'Connected' : 'Offline'}</Text>
      <Text style={styles.body}>{queued} action{queued === 1 ? '' : 's'} waiting to sync.</Text>
      <Text style={styles.muted}>Saved actions sync automatically when connectivity returns or when the app becomes active. Keep this device signed in until they finish.</Text>
      <Button title={working ? 'Syncing…' : 'Sync now'} disabled={working || !online || !queued} onPress={() => { setWorking(true); void synchronize().finally(() => setWorking(false)); }} />
    </Card>
    <Text style={styles.section}>Issues ({issues.length})</Text>
    {!issues.length && <Text style={styles.muted}>No sync conflicts.</Text>}
    {issues.map((issue) => <Card key={issue.idempotencyKey}>
      <Text style={styles.body}>{issue.payload.transactionType} · {issue.payload.quantityChanged} item(s)</Text>
      <Text style={styles.muted}>{issue.error}</Text>
      <Text style={styles.muted}>Action {issue.idempotencyKey}</Text>
      <Button title="Discard issue" secondary onPress={() => void discard(issue.idempotencyKey)} />
    </Card>)}
  </Screen>;
}
