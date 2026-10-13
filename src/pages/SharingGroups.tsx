import { Box, Typography } from '@mui/material';
import { InventoryAccessGroups } from '../components/operations/InventoryAccessGroups';
import { useLocalizedText } from '../utils/naming';

/** Share groups for everyone, e.g. a tenant's group of people allowed into their rented building. */
export function SharingGroups() {
  const t = useLocalizedText();
  return <Box>
    <Typography variant="h4" sx={{ mb: 0.5, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>{t('Freigabegruppen', 'Sharing groups')}</Typography>
    <Typography variant="body2" color="text.secondary">
      {t('Teile private Artikel, Sets und Lagerorte mit einer Gruppe statt mit einzelnen Personen. Gibst du einen Lagerort frei, sieht die Gruppe auch alles, was dort gelagert ist.',
        'Share private items, kits and storage locations with a group instead of single people. When you share a storage location, the group also sees everything stored there.')}
    </Typography>
    <InventoryAccessGroups />
  </Box>;
}
