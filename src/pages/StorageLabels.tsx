import { Alert, Box, GlobalStyles, Stack, Typography } from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/shared/ActionButtons';
import { CodeLabel } from '../components/qr/CodeLabel';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { buildLocationTree, flattenLocationTree, holdsStock, locationPath, type LocationTreeNode } from '../utils/locationHierarchy';
import { translate, useT } from '../utils/naming';

/** Print sheet with one QR label per active section and storage place below a location or section. */
export function StorageLabels() {
  const t = useT();
  const { locationId } = useParams();
  const locations = useStorageLocations();
  const all = locations.data ?? [];
  const findNode = (nodes: LocationTreeNode[]): LocationTreeNode | undefined =>
    nodes.find((node) => node.location.id === locationId) ?? nodes.map((node) => findNode(node.children)).find(Boolean);
  const node = findNode(buildLocationTree(all));
  const labels = node ? flattenLocationTree(node).filter((location) => location.active && holdsStock(location)) : [];

  if (locations.error) return <Alert severity="error">{locations.error.message}</Alert>;
  if (!node) return <Typography>{locations.isLoading ? t('pages.locationScan.loading') : t('pages.locationScan.locationNotFound')}</Typography>;
  return <Stack spacing={2}>
    <GlobalStyles styles={{ '@media print': {
      'header, nav, .MuiAppBar-root, .MuiDrawer-root, .no-print': { display: 'none !important' },
      'main': { margin: '0 !important', padding: '0 !important' },
      '.storage-label': { breakInside: 'avoid' },
    } }} />
    <Stack direction="row" className="no-print" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <Button title={translate('pages.storageLocations.returnToTheStorageLocationList')} component={Link} to={`/storage-locations?locationId=${node.location.id}`} startIcon={<ArrowBackIcon />}>
        {t('pages.storageLocations.backToLocationList')}
      </Button>
      <Button title={translate('pages.storageLocations.printTheseLabels')} variant="contained" startIcon={<PrintIcon />} disabled={labels.length === 0} onClick={() => window.print()}>
        {t('pages.storageLocations.print')}
      </Button>
    </Stack>
    <Typography variant="h5">{t('pages.storageLocations.labelsFor', { name: locationPath(node.location, all) })} ({labels.length})</Typography>
    {labels.length === 0 && <Alert severity="info">{t('pages.storageLocations.noLabelsHere')}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 2 }}>
      {labels.map((location) => <Box key={location.id} className="storage-label" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, minWidth: 0 }}>
        <CodeLabel compact code={`${window.location.origin}/locations/${location.id}`} />
        <Typography variant="subtitle2" className="mono" sx={{ mt: 0.5, wordBreak: 'break-all' }}>{location.fullCode}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>{locationPath(location, all)}</Typography>
      </Box>)}
    </Box>
  </Stack>;
}
