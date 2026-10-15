import { Button } from '../components/shared/ActionButtons';
import { Stack, Typography, Alert } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useAuth } from '../hooks/useAuth';
import { canOperateWarehouse } from '../utils/access';
import { translate, useT } from '../utils/naming';
import { StockPositions } from '../components/operations/StockOperations';
import { CodeLabel } from '../components/qr/CodeLabel';
import { locationPath } from '../utils/locationHierarchy';
import { InventorySharing } from '../components/items/InventorySharing';
export function LocationScan() {
  return <WarehouseLocation />;
}
function WarehouseLocation() {
  const { user } = useAuth();
  const { locationId } = useParams(); const t = useT(); const locations = useStorageLocations();
  const location = locations.data?.find(l => l.id === locationId);
  if (locations.error) return <Alert severity="error">{locations.error.message}</Alert>;
  if (!location) return <Typography>{locations.isLoading ? t('pages.locationScan.loading') : t('pages.locationScan.locationNotFound')}</Typography>;
  if (!location.access?.privateResource && !canOperateWarehouse(user)) return <Stack spacing={2}><Alert severity="info">{t('pages.locationScan.yourAssignedStorageAndPickupsAreAvailableOnYourDashboard')}</Alert><Button component={Link} to="/storage-locations">{t('nav.storageLocations')}</Button></Stack>;
  const editable = location.access?.privateResource ? location.access.canEdit : canOperateWarehouse(user);
  return <Stack spacing={2}>
    <Typography variant="h4">{locationPath(location, locations.data ?? [])}</Typography>
    <InventorySharing kind="storage-locations" id={location.id} access={location.access} />
    {editable && canOperateWarehouse(user) && <Button title={translate('pages.locationScan.createATransferFromThisStorageLocation')} component={Link} to={`/operations?tab=transfers&sourceLocationId=${location.id}`}>{t('pages.locationScan.transferFromHere')}</Button>}
    <StockPositions key={location.id} locationId={location.id} />
    <CodeLabel code={`${window.location.origin}/locations/${location.id}`} />
  </Stack>;
}
