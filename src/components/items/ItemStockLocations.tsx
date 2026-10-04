import { Grid, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { Item } from '../../types';
import { useOperationList } from '../../hooks/useOperations';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { operationsApi } from '../../services/operationsService';
import { locationPath } from '../../utils/locationHierarchy';
import { useLocalizedText } from '../../utils/naming';
import { QueryFeedback } from '../common/QueryFeedback';
import { isAssetStored } from '../../utils/locationStock';

/** Show physical stock grouped by location when the item occupies multiple locations. */
export function ItemStockLocations({ item }: { item: Item }) {
  const t = useLocalizedText();
  const serialized = item.trackingMode === 'serialized';
  const positions = useOperationList(`positions:${item.id}:`, operationsApi.positions({ itemId: item.id }), !serialized);
  const assets = useOperationList(`assets:${item.id}:`, operationsApi.assets({ itemId: item.id }), serialized);
  const locations = useStorageLocations({ includeInactive: true });
  const quantities = new Map<string, { quantity: number; name?: string }>();
  if (serialized) {
    for (const asset of assets.data ?? []) {
      if (!asset.currentLocationId || !isAssetStored(asset)) continue;
      const current = quantities.get(asset.currentLocationId);
      quantities.set(asset.currentLocationId, { quantity: (current?.quantity ?? 0) + 1, name: asset.currentLocationName });
    }
  } else {
    for (const position of positions.data ?? []) {
      if (!position.locationId || position.quantityOnHand <= 0) continue;
      quantities.set(position.locationId, { quantity: (quantities.get(position.locationId)?.quantity ?? 0) + position.quantityOnHand });
    }
  }
  const error = positions.error || assets.error || locations.error;
  const ready = serialized ? assets.isComplete : positions.isComplete;
  if (!error && (!ready || quantities.size <= 1)) return null;
  const rows = [...quantities].map(([id, stock]) => {
    const location = locations.data?.find(location => location.id === id);
    return { id, quantity: stock.quantity, name: location ? locationPath(location, locations.data ?? []) : stock.name ?? id };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return <Grid size={12}>
    <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Bestand nach Lagerort', 'Stock by location')}</Typography>
    <QueryFeedback error={error} />
    {ready && quantities.size > 1 && <TableContainer>
      <Table size="small" aria-label={t('Bestand nach Lagerort', 'Stock by location')}>
        <TableHead><TableRow><TableCell>{t('Lagerort', 'Storage location')}</TableCell><TableCell align="right">{t('Vor Ort', 'On hand')}</TableCell></TableRow></TableHead>
        <TableBody>{rows.map(row => <TableRow key={row.id}>
          <TableCell><Link component={RouterLink} to={`/storage-locations?locationId=${encodeURIComponent(row.id)}`}>{row.name}</Link></TableCell>
          <TableCell align="right">{row.quantity}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>}
  </Grid>;
}
