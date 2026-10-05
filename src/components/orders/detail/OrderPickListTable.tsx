import { Button, IconButton } from '../../shared/ActionButtons';
import { QuantityControl } from '../QuantityControl';
import { CatalogSearchField } from '../CatalogSearchField';
import { filterCatalogItems, filterCatalogAssemblies } from '../../../utils/orderCatalog';
import { useState, type ReactNode } from 'react';
import {
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import type { Assembly, AssetInstance, FactionOrder, Item } from '../../../types';
import { useItemAssets } from '../../../hooks/useItems';
import { useEquipmentAvailability } from '../../../hooks/useEquipment';
import { translate, useLocalizedText } from '../../../utils/naming';

export interface OrderPickListTableProps {
  order: FactionOrder;
  /** Items ordered on their own. */
  orderItems: Item[];
  /** Every item on an order line, including assembly components. */
  lineItems: Item[];
  orderAssemblies: Assembly[];
  orderItemCategories: string[];
  itemMap: Map<string, Item>;
  prepared: Record<string, string>;
  preparedAssemblies: Record<string, string>;
  assetAssignments: Record<string, string[]>;
  onSetPrepared: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetPreparedAssemblies: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetAssetAssignments: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  availableFor: (item: Item) => number;
  availableAssemblies: (assembly: Assembly) => number;
  availableForItemId: (itemId: string) => number;
}

function assetLabel(asset: AssetInstance) {
  return [
    asset.assetCode,
    asset.serialNumber && `SN ${asset.serialNumber}`,
    [asset.manufacturer, asset.model].filter(Boolean).join(' '),
    asset.currentLocationName || asset.availabilityStatus,
  ].filter(Boolean).join(' · ');
}

function locationName(item?: Item) {
  return item?.expand?.storageLocation?.name || item?.storageLocation || '';
}

function SerializedAssetPicker({
  eventId,
  item,
  required,
  selectedIds,
  persistedAssets,
  editable,
  onChange,
}: {
  eventId: string;
  item: Item;
  required: number;
  selectedIds: string[];
  persistedAssets: AssetInstance[];
  editable: boolean;
  onChange: (ids: string[]) => void;
}) {
  const t = useLocalizedText();
  const { data: assets = [], isLoading } = useItemAssets(editable ? item.id : undefined);
  const knownAssets = editable ? assets : persistedAssets;
  const equipment = useEquipmentAvailability(eventId);
  const commitment = equipment.data?.[item.id];
  const eligible = knownAssets.filter((asset) => asset.active && (
    selectedIds.includes(asset.id)
    || (asset.availabilityStatus === 'available'
      && (!commitment || commitment.assetIds.includes(asset.id))
      && !['damaged', 'unsafe', 'lost'].includes(asset.conditionStatus)
      && !['overdue', 'in_service'].includes(asset.serviceStatus ?? 'certified'))
  ));
  const selected = knownAssets.filter((asset) => selectedIds.includes(asset.id));

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ px: 1.5, py: 1, alignItems: { md: 'center' } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: { md: 240 }, flexShrink: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>{item.name}</Typography>
        <Chip size="small" color={selectedIds.length === required ? 'success' : 'warning'} label={`${selectedIds.length}/${required}`} />
      </Stack>
      {editable ? (
        <Autocomplete
          multiple
          size="small"
          disableCloseOnSelect
          loading={isLoading}
          options={eligible}
          value={selected}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          getOptionLabel={assetLabel}
          getOptionDisabled={(option) => !selectedIds.includes(option.id) && selectedIds.length >= required}
          onChange={(_, value) => onChange(value.map((asset) => asset.id))}
          sx={{ flex: 1, minWidth: 0 }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t(`Genau ${required} Seriengerät${required === 1 ? '' : 'e'} wählen`, `Select exactly ${required} asset${required === 1 ? '' : 's'}`)}
              error={!isLoading && selectedIds.length !== required}
            />
          )}
        />
      ) : (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', flex: 1 }}>
          {persistedAssets.map((asset) => <Chip key={asset.id} size="small" label={assetLabel(asset)} variant="outlined" />)}
        </Stack>
      )}
    </Stack>
  );
}

/** One pick line: name and location on the left, demand and the prepared quantity on the right. */
function PickRow({
  leading,
  title,
  caption,
  requested,
  available,
  stored,
  storedLabel,
  editing,
  value,
  onChange,
  onMax,
  quantityLabel,
  done,
  children,
}: {
  leading?: ReactNode;
  title: string;
  caption: ReactNode;
  requested: number;
  available: number;
  stored: number;
  storedLabel: string;
  editing: boolean;
  value: string;
  onChange: (value: string) => void;
  onMax: () => void;
  quantityLabel: string;
  done?: boolean;
  children?: ReactNode;
}) {
  const t = useLocalizedText();
  const complete = (Number(value) || 0) === requested;
  return (
    <Box component="li" sx={{ borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 }, bgcolor: done ? 'action.hover' : undefined }}>
      <Stack direction="row" useFlexGap sx={{ px: 1, py: 0.5, columnGap: 1, rowGap: 0.25, alignItems: 'center', flexWrap: 'wrap' }}>
        {leading}
        <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>{caption}</Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 'auto', flexShrink: 0 }}>
          <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
            {t('Bedarf', 'Req.')} <strong>{requested}</strong>
            {' · '}
            <Box component="span" sx={{ color: available >= requested ? 'success.main' : 'warning.main' }}>{t('Verf.', 'Avail.')} <strong>{available}</strong></Box>
            {!editing && <> · {storedLabel} <Box component="strong" sx={{ color: stored === requested ? 'success.main' : undefined }}>{stored}</Box></>}
          </Typography>
          {editing && <>
            <QuantityControl label={quantityLabel} value={value} max={requested} onChange={onChange} />
            <Button title={translate('Die angefragte Menge als vorbereitet eintragen', 'Set the prepared quantity to the requested amount')}
              size="small" variant={complete ? 'contained' : 'outlined'} color={complete ? 'success' : 'primary'} onClick={onMax}
              sx={{ minWidth: 48, height: 28, px: 1, fontSize: '0.75rem' }}>
              {complete ? 'OK' : t('Max', 'Max')}
            </Button>
          </>}
        </Stack>
      </Stack>
      {children}
    </Box>
  );
}

function SectionTitle({ children, count }: { children: ReactNode; count: number }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5, mt: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{children}</Typography>
      <Chip size="small" variant="outlined" label={count} />
    </Stack>
  );
}

export function OrderPickListTable({
  order,
  orderItems,
  lineItems,
  orderAssemblies,
  orderItemCategories,
  itemMap,
  prepared,
  preparedAssemblies,
  assetAssignments,
  onSetPrepared,
  onSetPreparedAssemblies,
  onSetAssetAssignments,
  availableFor,
  availableAssemblies,
  availableForItemId,
}: OrderPickListTableProps) {
  const t = useLocalizedText();
  const [itemSearch, setItemSearch] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [sortByLocation, setSortByLocation] = useState(false);
  const [expandedAssemblies, setExpandedAssemblies] = useState<Record<string, boolean>>({});
  const [assemblyChecked, setAssemblyChecked] = useState<Record<string, Record<string, boolean>>>({});
  const editing = order.status === 'preparing';
  const storedLabel = ['picked_up', 'partially_returned', 'returned', 'closed'].includes(order.status) ? t('Verwendet', 'Used') : t('Bereit', 'Prepared');

  // Serialized components of assemblies need concrete assets as well.
  const serializedItems = lineItems.filter((item) => item.trackingMode === 'serialized').map((item) => {
    let required = Number(prepared[item.id] || 0);
    for (const assembly of orderAssemblies) {
      required += Number(preparedAssemblies[assembly.id] || 0) * (assembly.itemQuantities?.[item.id] ?? 0);
    }
    return { item, required, persisted: order.assetAssignments?.[item.id] ?? [] };
  }).filter(({ item, required, persisted }) => required > 0 || persisted.length > 0
    || (assetAssignments[item.id]?.length ?? 0) > 0);

  const visibleOrderItems = filterCatalogItems(orderItems, itemSearch, itemCategory, undefined, sortByLocation);
  const visibleOrderAssemblies = filterCatalogAssemblies(orderAssemblies, itemSearch);

  function toggleItemCheck(assemblyId: string, itemId: string) {
    setAssemblyChecked((prev) => {
      const current = prev[assemblyId] ?? {};
      return { ...prev, [assemblyId]: { ...current, [itemId]: !current[itemId] } };
    });
  }

  return (
    <Box sx={{ mb: 2 }}>
      {(orderAssemblies.length > 0 || orderItems.length > 0) && (
        <Stack direction="row" useFlexGap sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <CatalogSearchField label={t('Artikel oder Baugruppen suchen', 'Search items or assemblies')} value={itemSearch} onChange={setItemSearch}
            sx={{ flex: '1 1 260px' }} />
          {orderItems.length > 0 && orderItemCategories.length > 1 && (
            <FormControl size="small" sx={{ flex: '1 1 160px', maxWidth: { sm: 240 } }}>
              <InputLabel>{t('Kategorie', 'Category')}</InputLabel>
              <Select label={t('Kategorie', 'Category')} value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}>
                <MenuItem value="">{t('Alle Kategorien', 'All categories')}</MenuItem>
                {orderItemCategories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          {orderItems.length > 0 && (
            <Button
              size="small"
              variant={sortByLocation ? 'contained' : 'outlined'}
              color={sortByLocation ? 'primary' : 'inherit'}
              startIcon={<LocationOnIcon fontSize="small" />}
              aria-pressed={sortByLocation}
              title={translate('Die Sortierung nach Lagerort ein- oder ausschalten', 'Toggle sorting by storage location')}
              onClick={() => setSortByLocation((prev) => !prev)}
              sx={{ height: 40, flexShrink: 0, whiteSpace: 'nowrap', textTransform: 'none' }}
            >
              {t('Nach Lagerort', 'By location')}
            </Button>
          )}
        </Stack>
      )}

      {serializedItems.length > 0 && <>
        <SectionTitle count={serializedItems.length}>{t('Seriengeräte', 'Serialized assets')}</SectionTitle>
        <Paper variant="outlined" sx={{ '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
          {serializedItems.map(({ item, required, persisted }) => (
            <SerializedAssetPicker
              eventId={order.eventOccurrenceId}
              key={item.id}
              item={item}
              required={required}
              selectedIds={assetAssignments[item.id] ?? []}
              persistedAssets={persisted}
              editable={editing}
              onChange={(ids) => onSetAssetAssignments((current) => ({ ...current, [item.id]: ids }))}
            />
          ))}
        </Paper>
      </>}

      {orderAssemblies.length > 0 && <>
        <SectionTitle count={orderAssemblies.length}>{t('Baugruppen', 'Assemblies')}</SectionTitle>
        <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {visibleOrderAssemblies.map((assembly) => {
            const requested = order.requestedAssemblyQuantities?.[assembly.id] ?? 0;
            const isExpanded = expandedAssemblies[assembly.id] ?? false;
            const componentEntries = Object.entries(assembly.itemQuantities ?? {});
            const checked = assemblyChecked[assembly.id] ?? {};
            const checkedCount = componentEntries.filter(([itemId]) => checked[itemId]).length;
            const allChecked = componentEntries.length > 0 && checkedCount === componentEntries.length;
            return (
              <PickRow
                key={assembly.id}
                leading={<IconButton title={translate('Die Komponenten dieser Baugruppe ein- oder ausblenden', 'Show or hide the components of this assembly')}
                  size="small" onClick={() => setExpandedAssemblies((prev) => ({ ...prev, [assembly.id]: !prev[assembly.id] }))} aria-expanded={isExpanded}>
                  {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>}
                title={assembly.name}
                caption={<>
                  <CategoryIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5 }} />
                  {componentEntries.length} {t('Komponenten', 'components')}
                  {componentEntries.length > 0 && <> · <Box component="span" sx={{ color: allChecked ? 'success.main' : undefined }}>{checkedCount}/{componentEntries.length} {t('abgehakt', 'checked')}</Box></>}
                </>}
                requested={requested}
                available={availableAssemblies(assembly)}
                stored={order.preparedAssemblyQuantities?.[assembly.id] ?? 0}
                storedLabel={storedLabel}
                editing={editing}
                value={preparedAssemblies[assembly.id] ?? ''}
                onChange={(value) => onSetPreparedAssemblies((current) => ({ ...current, [assembly.id]: value }))}
                onMax={() => onSetPreparedAssemblies((current) => ({ ...current, [assembly.id]: String(requested) }))}
                quantityLabel={`${assembly.name} ${t('Bereit', 'Prepared')}`}
                done={allChecked}
              >
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, pl: { xs: 1, sm: 5 }, pb: 0.5 }}>
                    {componentEntries.map(([itemId, perAssembly]) => {
                      const component = itemMap.get(itemId);
                      const totalNeeded = requested * perAssembly;
                      const componentAvailable = availableForItemId(itemId);
                      const isChecked = Boolean(checked[itemId]);
                      return (
                        <Stack key={itemId} component="li" direction="row" spacing={1} sx={{ alignItems: 'center', pr: 1 }}>
                          <Checkbox size="small" checked={isChecked} onChange={() => toggleItemCheck(assembly.id, itemId)}
                            slotProps={{ input: { 'aria-label': `${component?.name ?? itemId}: ${t('abgehakt', 'checked')}` } }} sx={{ p: 0.5 }} />
                          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, textDecoration: isChecked ? 'line-through' : 'none' }} noWrap>
                            {component?.name ?? itemId}
                            <Typography component="span" variant="caption" color="text.secondary">
                              {' · '}{locationName(component) || t('Kein Lagerort', 'No storage location')}{component?.hint ? ` · ${component.hint}` : ''}
                            </Typography>
                          </Typography>
                          <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                            <strong>{totalNeeded}×</strong> ({perAssembly}/{t('Satz', 'kit')}) · <Box component="span" sx={{ color: componentAvailable >= totalNeeded ? 'success.main' : 'warning.main' }}>{t('Verf.', 'Avail.')} {componentAvailable}</Box>
                          </Typography>
                        </Stack>
                      );
                    })}
                  </Box>
                </Collapse>
              </PickRow>
            );
          })}
          {!visibleOrderAssemblies.length && <Typography component="li" variant="body2" color="text.secondary" sx={{ p: 1 }}>{t('Keine passenden Baugruppen.', 'No matching assemblies.')}</Typography>}
        </Paper>
      </>}

      {orderItems.length > 0 && <>
        <SectionTitle count={orderItems.length}>{t('Einzelartikel', 'Individual items')}</SectionTitle>
        <Paper variant="outlined" component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {visibleOrderItems.map((item) => {
            const requested = order.requestedQuantities[item.id] ?? 0;
            return (
              <PickRow
                key={item.id}
                title={item.name}
                caption={[locationName(item) || t('Kein Lagerort', 'No storage location'), item.category].filter(Boolean).join(' · ')}
                requested={requested}
                available={availableFor(item)}
                stored={order.preparedQuantities[item.id] ?? 0}
                storedLabel={storedLabel}
                editing={editing}
                value={prepared[item.id] ?? ''}
                onChange={(value) => onSetPrepared((current) => ({ ...current, [item.id]: value }))}
                onMax={() => onSetPrepared((current) => ({ ...current, [item.id]: String(requested) }))}
                quantityLabel={`${item.name} ${t('Bereit', 'Prepared')}`}
              />
            );
          })}
          {!visibleOrderItems.length && <Typography component="li" variant="body2" color="text.secondary" sx={{ p: 1 }}>{t('Keine passenden Artikel.', 'No matching items.')}</Typography>}
        </Paper>
      </>}
    </Box>
  );
}
