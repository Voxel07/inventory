import { Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { DetailPanel } from './CompactDetail';
import { Link as RouterLink } from 'react-router-dom';
import type { Item } from '../../types';
import { useCompleteList } from '../../hooks/usePagedList';
import { useStorageLocations } from '../../hooks/useStorageLocations';
import { operationsApi } from '../../services/operationsService';
import { locationPath } from '../../utils/locationHierarchy';
import { useT } from '../../utils/naming';
import { QueryFeedback } from '../common/QueryFeedback';
import { isAssetStored } from '../../utils/locationStock';
import { formatQuantity } from '../../utils/stock';

/** Show physical stock grouped by location when the item occupies multiple locations. */
export function ItemStockLocations({ item }: { item: Item }) {
  const t = useT();
  const serialized = item.trackingMode === 'serialized';
  const positions = useCompleteList(['operations', `positions:${item.id}:`], operationsApi.positions({ itemId: item.id }), { enabled: !serialized });
  const assets = useCompleteList(['operations', `assets:${item.id}:`], operationsApi.assets({ itemId: item.id }), { enabled: serialized });
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
  return <DetailPanel title={t('items.itemStockLocations.stockByLocation')}>
    <QueryFeedback error={error} />
    {ready && quantities.size > 1 && <TableContainer>
      <Table size="small" aria-label={t('items.itemStockLocations.stockByLocation')} sx={{ '& .MuiTableCell-root': { py: 0.25, fontSize: '0.8125rem' } }}>
        <TableHead><TableRow><TableCell>{t('common.storageLocation')}</TableCell><TableCell align="right">{t('items.itemStockLocations.onHand')}</TableCell></TableRow></TableHead>
        <TableBody>{rows.map(row => <TableRow key={row.id}>
          <TableCell><Link component={RouterLink} to={`/storage-locations?locationId=${encodeURIComponent(row.id)}`}>{row.name}</Link></TableCell>
          <TableCell align="right">{formatQuantity(item, row.quantity)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </TableContainer>}
  </DetailPanel>;
}
