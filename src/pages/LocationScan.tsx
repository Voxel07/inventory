import { Button, Stack, Typography, Alert } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useAuth } from '../hooks/useAuth';
import { canOperateWarehouse } from '../utils/access';
import { useLocalizedText } from '../utils/naming';
import { StockPositions } from '../components/operations/StockOperations';
import { CodeLabel, CodeManagement } from '../components/qr/CodeManagement';
import { locationPath } from '../utils/locationHierarchy';
export function LocationScan() {
  const t = useLocalizedText(); const { user } = useAuth();
  if (!canOperateWarehouse(user)) return <Stack spacing={2}><Alert severity="info">{t('Eigene Lagerbestände und Abholungen finden Sie in Ihrer Ausrüstungsübersicht.', 'Your assigned storage and pickups are available in your equipment workspace.')}</Alert><Button component={Link} to="/contributor">{t('Meine Ausrüstung', 'My equipment')}</Button></Stack>;
  return <WarehouseLocation />;
}
function WarehouseLocation() {
  const { locationId } = useParams(); const t = useLocalizedText(); const locations = useStorageLocations();
  const location = locations.data?.find(l => l.id === locationId);
  if (locations.error) return <Alert severity="error">{locations.error.message}</Alert>;
  if (!location) return <Typography>{locations.isLoading ? t('Laden…', 'Loading…') : t('Lagerort nicht gefunden.', 'Location not found.')}</Typography>;
  return <Stack spacing={2}><Typography variant="h4">{locationPath(location, locations.data ?? [])}</Typography><Button component={Link} to={`/operations?tab=transfers&sourceLocationId=${location.id}`}>{t('Von hier umlagern', 'Transfer from here')}</Button><StockPositions key={location.id} locationId={location.id} /><CodeLabel code={`${window.location.origin}/locations/${location.id}`} /><CodeManagement targetId={location.id} targetType="location" /></Stack>;
}
