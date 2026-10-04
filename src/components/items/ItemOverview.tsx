import { Chip, Grid, Link, Stack, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Link as RouterLink } from 'react-router-dom';
import type { Item } from '../../types';
import { IconButton } from '../shared/ActionButtons';
import { EquipmentOwnership } from './EquipmentOwnership';
import { InventorySharing } from './InventorySharing';
import { CodeManagement } from '../qr/CodeManagement';
import { Fact, FactList } from './DetailSection';
import { useLocalizedText } from '../../utils/naming';

export function ItemOverview({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const t = useLocalizedText();
  return <>
    <Grid size={12}>
      <FactList>
        <Fact label={t('Kategorie', 'Category')}>{[item.category, item.subcategory].filter(Boolean).join(' · ') || '—'}</Fact>
        <Fact label={t('Lagerort', 'Storage location')}>{item.storageLocation ? <Link component={RouterLink} to={`/storage-locations?locationId=${encodeURIComponent(item.storageLocation)}`} underline="hover">{item.expand?.storageLocation?.name || item.storageLocation}</Link> : '—'}</Fact>
        <Fact label={t('Genauer Ort', 'Exact location')}>{[item.expand?.storageLocation?.location, item.expand?.storageLocation?.position].filter(Boolean).join(' / ') || '—'}</Fact>
        <Fact label={t('Rückgabeort', 'Return location')}>{item.expand?.returnLocation?.name || item.returnLocation || '—'}</Fact>
      </FactList>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mt: 2 }}>
        <Typography variant="body2" color="text.secondary">{t('Freigegebene Event-Nutzung', 'Approved event use')}</Typography>
        <Tooltip arrow enterTouchDelay={0} title={t('Die Event-Zuordnung beschreibt die Nutzung. Verfügbarkeit und erforderliche Zusagen werden getrennt geprüft.', 'Event assignments describe intended use. Availability and required commitments are checked separately.')}>
          <IconButton size="small" aria-label={t('Information zur Event-Nutzung', 'About event use')}><InfoOutlinedIcon sx={{ fontSize: 18 }} /></IconButton>
        </Tooltip>
        {item.eventTypes?.length
          ? item.eventTypes.map(event => <Chip key={event} size="small" variant="outlined" label={event === 'LS' ? 'LightSim' : event} />)
          : <Typography variant="body2" color="text.secondary">— {t('keine', 'none')}</Typography>}
      </Stack>
    </Grid>
    <Grid size={{ xs: 12, md: 6 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Eigentum & Verwahrung', 'Ownership & keeper')}</Typography>
      <EquipmentOwnership item={item} canEdit={canEdit} embedded />
    </Grid>
    <Grid size={{ xs: 12, md: 6 }}>
      <Stack spacing={2}>
        <InventorySharing kind="items" id={item.id} access={item.access} />
        {canEdit && <CodeManagement targetId={item.id} targetType="product" embedded />}
      </Stack>
    </Grid>
  </>;
}
