import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useInventory } from '../inventoryContext';
import { styles } from '../theme';
import { Button, Card, Field, Screen } from '../ui';

export default function Scan() {
  const router = useRouter();
  const { resolve } = useInventory();
  const [permission, askPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scanning = useRef(false);

  async function handle(value: string) {
    if (scanning.current) return;
    scanning.current = true;
    setBusy(true);
    setError('');
    try {
      const target = await resolve(value);
      if (!target) { setError('Code not found in the saved catalog or on the server.'); return; }
      router.replace({ pathname: '/item/[id]', params: { id: target.itemId, ...(target.assetId ? { assetId: target.assetId } : {}) } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resolve this code.');
    } finally {
      scanning.current = false;
      setBusy(false);
    }
  }

  return <Screen title="Scan code" back>
    <Card><Text style={styles.body}>Point the camera at an item or asset QR code. You can also enter a SKU, barcode, or code from a handheld scanner.</Text>
      {!permission?.granted ? <Button title="Allow camera" onPress={() => void askPermission()} /> :
        <View style={{ height: 310, overflow: 'hidden', borderRadius: 12 }}><CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'datamatrix'] }} onBarcodeScanned={busy ? undefined : ({ data }) => void handle(data)} /></View>}
      <Field label="Enter code" placeholder="Scan or type a code" value={manual} onChangeText={setManual} onSubmitEditing={() => void handle(manual)} autoCapitalize="none" />
      <Button title={busy ? 'Looking up…' : 'Find code'} disabled={busy || !manual.trim()} onPress={() => void handle(manual)} />
      {!!error && <Text style={{ color: '#b42318' }}>{error}</Text>}
    </Card>
  </Screen>;
}
