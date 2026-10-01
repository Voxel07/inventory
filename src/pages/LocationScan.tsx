import { Button } from '../components/shared/ActionButtons';
import { Stack, Typography, Alert } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useAuth } from '../hooks/useAuth';
import { canOperateWarehouse } from '../utils/access';
import { translate, useLocalizedText } from '../utils/naming';
import { StockPositions } from '../components/operations/StockOperations';
import { CodeLabel, CodeManagement } from '../components/qr/CodeManagement';
import { locationPath } from '../utils/locationHierarchy';
import { InventorySharing } from '../components/items/InventorySharing';
export function LocationScan() {
  return <WarehouseLocation />;
}
function WarehouseLocation() {
  const { user } = useAuth();
  const { locationId } = useParams(); const t = useLocalizedText(); const locations = useStorageLocations();
  const location = locations.data?.find(l => l.id === locationId);
  if (locations.error) return <Alert severity="error">{locations.error.message}</Alert>;
  if (!location) return <Typography>{locations.isLoading ? t('Laden…', 'Loading…') : t('Lagerort nicht gefunden.', 'Location not found.')}</Typography>;
  if (!location.access?.privateResource && !canOperateWarehouse(user)) return <Stack spacing={2}><Alert severity="info">{t('Eigene Lagerbestände und Abholungen finden Sie auf Ihrem Dashboard.', 'Your assigned storage and pickups are available on your dashboard.')}</Alert><Button component={Link} to="/storage-locations">{t('Lagerorte', 'Storage locations')}</Button></Stack>;
  const editable = location.access?.privateResource ? location.access.canEdit : canOperateWarehouse(user);
  return <Stack spacing={2}>
    <Typography variant="h4">{locationPath(location, locations.data ?? [])}</Typography>
    <InventorySharing kind="storage-locations" id={location.id} access={location.access} />
    {editable && canOperateWarehouse(user) && <Button title={translate('Eine Umlagerung von diesem Lagerort anlegen', 'Create a transfer from this storage location')} component={Link} to={`/operations?tab=transfers&sourceLocationId=${location.id}`}>{t('Von hier umlagern', 'Transfer from here')}</Button>}
    <StockPositions key={location.id} locationId={location.id} />
    <CodeLabel code={`${window.location.origin}/locations/${location.id}`} />
    {editable && <CodeManagement targetId={location.id} targetType="location" />}
  </Stack>;
}
