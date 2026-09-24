import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ApiError, request } from '../../api';
import { useInventory } from '../../inventoryContext';
import type { Asset, Item, TransactionInput } from '../../types';
import { colors, styles } from '../../theme';
import { Button, Card, Field, Screen } from '../../ui';

const canTransact = (role?: string) => role === 'hq_admin' || role === 'warehouse_crew';

export default function ItemDetail() {
  const { id, assetId } = useLocalSearchParams<{ id: string; assetId?: string }>();
  const { items, session, assets: getAssets, transact } = useInventory();
  const [item, setItem] = useState<Item | null>(items.find((entry) => entry.id === id) || null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState(assetId || '');
  const [type, setType] = useState<'checkout' | 'checkin'>('checkout');
  const [quantity, setQuantity] = useState('1');
  const [eventType, setEventType] = useState('');
  const [faction, setFaction] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const cached = items.find((entry) => entry.id === id);
    if (cached) setItem(cached);
    else if (id) void request<Item>(`/api/items/${encodeURIComponent(id)}`).then(setItem).catch(() => setMessage('Item is not in the saved catalog. Connect and refresh.'));
  }, [id, items]);
  useEffect(() => { if (item?.trackingMode === 'serialized') void getAssets(item.id).then(setAssets).catch(() => setMessage('Asset list is unavailable offline.')); }, [item?.id, item?.trackingMode, getAssets]);

  async function save() {
    if (!item) return;
    const parsed = Number(quantity);
    if (!Number.isInteger(parsed) || parsed < 1) { setMessage('Enter a whole quantity of at least 1.'); return; }
    if (type === 'checkout' && (!eventType.trim() || !faction.trim())) { setMessage('Event type and faction are required for checkout.'); return; }
    if (item.trackingMode === 'serialized' && !selectedAsset) { setMessage('Select the individual asset.'); return; }
    const input: TransactionInput = {
      itemId: item.id,
      transactionType: type,
      quantityChanged: item.trackingMode === 'serialized' ? 1 : parsed,
      reason: reason.trim(), notes: notes.trim(),
      ...(selectedAsset && item.trackingMode === 'serialized' ? { assetInstanceId: selectedAsset } : {}),
      ...(type === 'checkout' ? { eventType: eventType.trim(), faction: faction.trim() } : {}),
    };
    setSaving(true);
    try {
      const outcome = await transact(input);
      setMessage(outcome === 'queued' ? 'Saved offline. Open Sync status to review the pending action.' : 'Transaction saved.');
      if (outcome === 'applied' && item.trackingMode === 'serialized') setAssets(await getAssets(item.id));
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Could not save transaction.');
    } finally { setSaving(false); }
  }

  return <Screen title={item?.name || 'Item'} back>
    {!item ? <Text style={styles.muted}>Loading item…</Text> : <>
      <Card><Text style={styles.section}>Stock</Text><Text style={styles.body}>Available: {item.stock?.available ?? '—'} · On hand: {item.stock?.onHand ?? '—'} · Checked out: {item.stock?.checkedOut ?? '—'}</Text>
        <Text style={styles.muted}>SKU: {item.sku || '—'} · Category: {item.category || '—'}</Text>{!!item.description && <Text style={styles.body}>{item.description}</Text>}
      </Card>
      {item.trackingMode === 'serialized' && <Card><Text style={styles.section}>Individual assets</Text>
        {assets.map((asset) => <Pressable key={asset.id} accessibilityRole="button" onPress={() => setSelectedAsset(asset.id)} style={{ padding: 11, borderRadius: 8, borderWidth: 1, borderColor: selectedAsset === asset.id ? colors.blue : colors.line, backgroundColor: selectedAsset === asset.id ? '#eef4ff' : colors.white }}>
          <Text style={styles.body}>{asset.assetCode} · {asset.availabilityStatus}{selectedAsset === asset.id ? ' ✓' : ''}</Text>
        </Pressable>)}
        {!assets.length && <Text style={styles.muted}>No assets cached for this item.</Text>}
      </Card>}
      {canTransact(session?.user?.role) ? <Card><Text style={styles.section}>Stock transaction</Text>
        <View style={styles.row}><Button title="Check out" secondary={type !== 'checkout'} onPress={() => setType('checkout')} /><Button title="Check in" secondary={type !== 'checkin'} onPress={() => setType('checkin')} /></View>
        {item.trackingMode !== 'serialized' && <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />}
        {type === 'checkout' && <><Field label="Event type" value={eventType} onChangeText={setEventType} placeholder="e.g. DE" /><Field label="Faction" value={faction} onChangeText={setFaction} placeholder="Faction name" /></>}
        <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Optional" />
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
        <Button title={saving ? 'Saving…' : type === 'checkout' ? 'Save checkout' : 'Save check-in'} disabled={saving} onPress={() => void save()} />
        {!!message && <Text style={styles.muted}>{message}</Text>}
      </Card> : <Card><Text style={styles.muted}>Your role can view this item. Stock transactions require warehouse access.</Text></Card>}
    </>}
  </Screen>;
}
