import type { ReactNode } from 'react';
import { Box, Chip, Grid, Link, Paper, Stack, Tooltip, Typography } from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Link as RouterLink } from 'react-router-dom';
import type { Item } from '../../types';
import { IconButton } from '../shared/ActionButtons';
import { EquipmentOwnership } from './EquipmentOwnership';
import { InventorySharing } from './InventorySharing';
import { CodeManagement } from '../qr/CodeManagement';
import { useLocalizedText } from '../../utils/naming';

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return <Box sx={{ px: 1.25, py: 1, bgcolor: 'action.hover', borderRadius: 1, minWidth: 0 }}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography component="div" variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{children}</Typography>
  </Box>;
}

export function ItemOverview({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const t = useLocalizedText();
  return <>
    <Grid size={{ xs: 12, md: 7 }}><Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}><Inventory2OutlinedIcon fontSize="small" color="primary" /><Typography variant="subtitle2">{t('Stammdaten & Lokalisierung', 'Master data & location')}</Typography></Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
          <DetailField label={t('Kategorie', 'Category')}>{item.category || '—'}</DetailField>
          <DetailField label={t('Unterkategorie', 'Subcategory')}>{item.subcategory || '—'}</DetailField>
          <DetailField label={t('Lagerort', 'Storage location')}>{item.storageLocation ? <Link component={RouterLink} to={`/storage-locations?locationId=${encodeURIComponent(item.storageLocation)}`} underline="hover">{item.expand?.storageLocation?.name || item.storageLocation}</Link> : '—'}</DetailField>
          <DetailField label={t('Genauer Ort', 'Exact location')}>{item.expand?.storageLocation?.location || '—'}</DetailField>
          <DetailField label={t('Position', 'Position')}>{item.expand?.storageLocation?.position || '—'}</DetailField>
          <DetailField label={t('Rückgabeort', 'Return location')}>{item.expand?.returnLocation?.name || item.returnLocation || '—'}</DetailField>
        </Box>
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, mb: 0.5 }}><Typography variant="caption" color="text.secondary">{t('Freigegebene Event-Nutzung', 'Approved event use')}</Typography><Tooltip arrow enterTouchDelay={0} title={t('Die Event-Zuordnung beschreibt die Nutzung. Verfügbarkeit und erforderliche Zusagen werden getrennt geprüft.', 'Event assignments describe intended use. Availability and required commitments are checked separately.')}><IconButton size="small" aria-label={t('Information zur Event-Nutzung', 'About event use')}><InfoOutlinedIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip></Stack>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75 }}>{item.eventTypes?.length ? item.eventTypes.map(event => <Chip key={event} size="small" variant="outlined" label={event === 'LS' ? 'LightSim' : event} />) : <Typography variant="body2" color="text.secondary">{t('Keine Events zugewiesen', 'No assigned events')}</Typography>}</Stack>
        </Box>
      </Paper>
      {canEdit && <CodeManagement targetId={item.id} targetType="product" embedded />}
    </Stack></Grid>
    <Grid size={{ xs: 12, md: 5 }}><Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}><ShieldOutlinedIcon fontSize="small" color="primary" /><Typography variant="subtitle2">{t('Eigentum & Verwahrung', 'Ownership & keeper')}</Typography></Stack>
        <EquipmentOwnership item={item} canEdit={canEdit} embedded />
      </Paper>
      <InventorySharing kind="items" id={item.id} access={item.access} />
    </Stack></Grid>
  </>;
}
