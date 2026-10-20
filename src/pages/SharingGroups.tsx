import { Box, Typography } from '@mui/material';
import { InventoryAccessGroups } from '../components/operations/InventoryAccessGroups';
import { useT } from '../utils/naming';

/** Share groups, e.g. a tenant's group of people allowed into their rented building. Read-only accounts only see theirs. */
export function SharingGroups() {
  const t = useT();
  return <Box>
    <Typography variant="h4" sx={{ mb: 0.5, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('common.sharingGroups')}</Typography>
    <Typography variant="body2" color="text.secondary">
      {t('pages.sharingGroups.sharePrivateItemsKitsAndStorageLocationsWithAGroup')}
    </Typography>
    <InventoryAccessGroups />
  </Box>;
}
