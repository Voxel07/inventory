import { Button, IconButton } from '../../shared/ActionButtons';
import { QuantityControl } from '../QuantityControl';
import { CatalogSearchField } from '../CatalogSearchField';
import { filterCatalogItems, filterCatalogAssemblies } from '../../../utils/orderCatalog';
import { useState } from 'react';
import {
  Autocomplete,
  Box,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CategoryIcon from '@mui/icons-material/Category';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import type { Assembly, AssetInstance, FactionOrder, Item } from '../../../types';
import { useItemAssets } from '../../../hooks/useItems';
import { useEquipmentAvailability } from '../../../hooks/useEquipment';
import { translate, useLocalizedText } from '../../../utils/naming';

export interface OrderPickListTableProps {
  order: FactionOrder;
  orderItems: Item[];
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
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 1.25, md: 1.5 }, '&:last-child': { pb: { xs: 1.25, md: 1.5 } } }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {t('Konkrete Seriengeräte für diese Bestellung', 'Specific serialized assets for this order')}
              </Typography>
            </Box>
            <Chip
              size="small"
              color={selectedIds.length === required ? 'success' : 'warning'}
              label={`${selectedIds.length}/${required}`}
            />
          </Stack>
          {editable ? (
            <Autocomplete
              multiple
              disableCloseOnSelect
              loading={isLoading}
              options={eligible}
              value={selected}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              getOptionLabel={assetLabel}
              getOptionDisabled={(option) => !selectedIds.includes(option.id) && selectedIds.length >= required}
              onChange={(_, value) => onChange(value.map((asset) => asset.id))}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('Seriengeräte auswählen', 'Select serialized assets')}
                  error={!isLoading && selectedIds.length !== required}
                  helperText={t(
                    `Genau ${required} Gerät${required === 1 ? '' : 'e'} auswählen.`,
                    `Select exactly ${required} asset${required === 1 ? '' : 's'}.`,
                  )}
                />
              )}
            />
          ) : (
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {persistedAssets.map((asset) => (
                <Chip key={asset.id} label={assetLabel(asset)} variant="outlined" />
              ))}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function OrderPickListTable({
  order,
  orderItems,
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
  const hasOrderItems = Boolean(orderItems.length);

  const serializedItems = orderItems.filter((item) => item.trackingMode === 'serialized').map((item) => {
    let required = Number(prepared[item.id] || 0);
    for (const assembly of orderAssemblies) {
      required += Number(preparedAssemblies[assembly.id] || 0) * (assembly.itemQuantities?.[item.id] ?? 0);
    }
    return { item, required, persisted: order.assetAssignments?.[item.id] ?? [] };
  }).filter(({ item, required, persisted }) => required > 0 || persisted.length > 0
    || (assetAssignments[item.id]?.length ?? 0) > 0);

  const visibleOrderItems = filterCatalogItems(orderItems, itemSearch, itemCategory, undefined, sortByLocation);
  const visibleOrderAssemblies = filterCatalogAssemblies(orderAssemblies, itemSearch);

  function setPreparedItemMax(itemId: string, max: number) {
    onSetPrepared((current) => ({ ...current, [itemId]: String(max) }));
  }

  function setPreparedAssemblyMax(assemblyId: string, max: number) {
    onSetPreparedAssemblies((current) => ({ ...current, [assemblyId]: String(max) }));
  }

  function toggleAssemblyExpand(assemblyId: string) {
    setExpandedAssemblies((prev) => ({ ...prev, [assemblyId]: !prev[assemblyId] }));
  }

  function toggleItemCheck(assemblyId: string, itemId: string) {
    setAssemblyChecked((prev) => {
      const current = prev[assemblyId] ?? {};
      return { ...prev, [assemblyId]: { ...current, [itemId]: !current[itemId] } };
    });
  }

  function assemblyAllChecked(assembly: Assembly): boolean {
    const checked = assemblyChecked[assembly.id] ?? {};
    return Object.keys(assembly.itemQuantities ?? {}).every((itemId) => checked[itemId]);
  }

  function quantityChips(requested: number, available: number, storedPrepared: number) {
    return (
      <>
        <Chip size="small" label={`${t('Bedarf', 'Requested')}: ${requested}`} />
        <Chip size="small" color={available >= requested ? 'success' : 'warning'} label={`${t('Verfügbar', 'Available')}: ${available}`} />
        {order.status !== 'preparing' && (
          <Chip
            size="small"
            color={storedPrepared === requested ? 'success' : 'default'}
            label={`${['picked_up', 'returned'].includes(order.status) ? t('Verwendet', 'Used') : t('Bereit', 'Prepared')}: ${storedPrepared}`}
          />
        )}
      </>
    );
  }

  return (
    <>
      {(Boolean(orderAssemblies.length) || Boolean(orderItems.length)) && (
        <Box
          sx={{
            containerName: 'order-filters',
            containerType: 'inline-size',
            mb: 2,
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 1,
              alignItems: 'center',
              '@container order-filters (min-width: 520px)': {
                gridTemplateColumns: hasOrderItems ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
              },
              '@container order-filters (min-width: 760px)': {
                gridTemplateColumns: hasOrderItems
                  ? 'minmax(260px, 1fr) minmax(180px, 220px) auto'
                  : 'minmax(0, 1fr)',
              },
            }}
          >
            <CatalogSearchField
              label={t('Artikel oder Baugruppen suchen', 'Search items or assemblies')}
              value={itemSearch}
              onChange={setItemSearch}
              sx={{
                '@container order-filters (min-width: 520px)': {
                  gridColumn: hasOrderItems ? '1 / -1' : 'auto',
                },
                '@container order-filters (min-width: 760px)': {
                  gridColumn: 'auto',
                },
              }}
            />
            {hasOrderItems && (
              <FormControl size="small" sx={{ minWidth: 0, width: '100%' }}>
                <InputLabel>{t('Kategorie', 'Category')}</InputLabel>
                <Select label={t('Kategorie', 'Category')} value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}>
                  <MenuItem value="">{t('Alle Kategorien', 'All categories')}</MenuItem>
                  {orderItemCategories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {hasOrderItems && (
              <Button
                size="small"
                variant={sortByLocation ? 'contained' : 'outlined'}
                color={sortByLocation ? 'primary' : 'inherit'}
                startIcon={<LocationOnIcon fontSize="small" />}
                aria-pressed={sortByLocation}
                title={translate('Die Sortierung nach Lagerort ein- oder ausschalten', 'Toggle sorting by storage location')}
                onClick={() => setSortByLocation((prev) => !prev)}
                sx={{
                  minHeight: 40,
                  width: '100%',
                  px: 1.5,
                  whiteSpace: 'nowrap',
                  textTransform: 'none',
                  fontWeight: 700,
                  '@container order-filters (min-width: 520px)': {
                    width: 'auto',
                    justifySelf: 'end',
                  },
                }}
              >
                {t('Nach Lagerort', 'By location')}
              </Button>
            )}
          </Box>
        </Box>
      )}

      {serializedItems.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <InventoryIcon color="primary" />
            <Typography variant="h6">{t('Seriengeräte', 'Serialized assets')}</Typography>
          </Stack>
          <Stack spacing={1}>
            {serializedItems.map(({ item, required, persisted }) => (
              <SerializedAssetPicker
                eventId={order.eventOccurrenceId}
                key={item.id}
                item={item}
                required={required}
                selectedIds={assetAssignments[item.id] ?? []}
                persistedAssets={persisted}
                editable={order.status === 'preparing'}
                onChange={(ids) => onSetAssetAssignments((current) => ({ ...current, [item.id]: ids }))}
              />
            ))}
          </Stack>
        </Box>
      )}

      {Boolean(orderAssemblies.length) && (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <CategoryIcon color="primary" />
            <Typography variant="h6">{t('Baugruppen', 'Assemblies')}</Typography>
          </Stack>
          <Stack spacing={1} sx={{ mb: 3 }}>
            {visibleOrderAssemblies.map((assembly) => {
              const requested = order.requestedAssemblyQuantities?.[assembly.id] ?? 0;
              const storedPrepared = order.preparedAssemblyQuantities?.[assembly.id] ?? 0;
              const available = availableAssemblies(assembly);
              const isExpanded = expandedAssemblies[assembly.id] ?? false;
              const allChecked = assemblyAllChecked(assembly);
              const componentEntries = Object.entries(assembly.itemQuantities ?? {});
              const checkedCount = componentEntries.filter(([itemId]) => (assemblyChecked[assembly.id] ?? {})[itemId]).length;
              const prepAssemblyVal = Number(preparedAssemblies[assembly.id] || 0);
              const isPrepComplete = prepAssemblyVal === requested;

              return (
                <Card
                  key={assembly.id}
                  variant="outlined"
                  sx={{
                    borderColor: allChecked ? 'success.main' : 'primary.dark',
                    bgcolor: allChecked ? 'rgba(95, 128, 104, 0.06)' : 'rgba(227, 6, 19, 0.045)',
                  }}
                >
                  <CardContent sx={{ p: { xs: 1.25, md: 1.5 }, '&:last-child': { pb: { xs: 1.25, md: 1.5 } } }}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <CategoryIcon color={allChecked ? 'success' : 'primary'} fontSize="small" sx={{ flexShrink: 0 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                            <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{assembly.name}</Typography>
                            {allChecked && <Chip size="small" color="success" label={t('Vollständig', 'Complete')} />}
                          </Stack>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {componentEntries.length} {t('Komponenten', 'components')}
                            {componentEntries.length > 0 && ` · ${checkedCount}/${componentEntries.length} ${t('abgehakt', 'checked')}`}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', flexShrink: 0 }}>
                          {quantityChips(requested, available, storedPrepared)}
                        </Stack>
                        {order.status === 'preparing' && (
                          <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', flexShrink: 0 }}>
                            <QuantityControl label={`${assembly.name} ${t('Bereit', 'Prepared')}`} value={preparedAssemblies[assembly.id] ?? ''} max={requested}
                            onChange={(value) => onSetPreparedAssemblies((current) => ({ ...current, [assembly.id]: value }))} />
                            <Button title={translate('Die angefragte Baugruppenmenge als vorbereitet eintragen', 'Set the prepared assembly quantity to the requested amount')}
                              size="small"
                              variant={isPrepComplete ? 'contained' : 'outlined'}
                              color={isPrepComplete ? 'success' : 'primary'}
                              onClick={() => setPreparedAssemblyMax(assembly.id, requested)}
                              sx={{ minWidth: 54, height: 32, fontSize: '0.75rem', px: 1 }}
                            >
                              {isPrepComplete ? 'OK' : t('Max', 'Max')}
                            </Button>
                          </Stack>
                        )}
                        <IconButton title={translate('Die Komponenten dieser Baugruppe ein- oder ausblenden', 'Show or hide the components of this assembly')} size="small" onClick={() => toggleAssemblyExpand(assembly.id)}>
                          {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                      </Stack>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ display: { xs: 'flex', md: 'none' }, flexWrap: 'wrap' }}>
                        {quantityChips(requested, available, storedPrepared)}
                      </Stack>
                      {order.status === 'preparing' && (
                        <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center' }}>
                          <QuantityControl label={`${assembly.name} ${t('Bereit', 'Prepared')}`} value={preparedAssemblies[assembly.id] ?? ''} max={requested}
                            onChange={(value) => onSetPreparedAssemblies((current) => ({ ...current, [assembly.id]: value }))} />
                          <Button title={translate('Die angefragte Baugruppenmenge als vorbereitet eintragen', 'Set the prepared assembly quantity to the requested amount')}
                            size="small"
                            variant={isPrepComplete ? 'contained' : 'outlined'}
                            color={isPrepComplete ? 'success' : 'primary'}
                            onClick={() => setPreparedAssemblyMax(assembly.id, requested)}
                            sx={{ ml: 'auto', minWidth: 64 }}
                          >
                            {isPrepComplete ? 'OK' : t('Max', 'Max')}
                          </Button>
                        </Stack>
                      )}
                    </Stack>

                    {/* Expandable Components Checklist */}
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Divider sx={{ my: 1 }} />
                      <Stack spacing={0.75} sx={{ pl: { xs: 0, sm: 2 } }}>
                        {componentEntries.map(([itemId, perAssembly]) => {
                          const compItem = itemMap.get(itemId);
                          const totalNeeded = requested * perAssembly;
                          const compAvailable = availableForItemId(itemId);
                          const isChecked = Boolean(assemblyChecked[assembly.id]?.[itemId]);
                          return (
                            <Stack
                              key={itemId}
                              direction="row"
                              spacing={1}
                              sx={{
                                alignItems: 'center',
                                p: 0.5,
                                borderRadius: 1,
                                bgcolor: isChecked ? 'action.selected' : 'transparent',
                              }}
                            >
                              <Checkbox
                                size="small"
                                checked={isChecked}
                                onChange={() => toggleItemCheck(assembly.id, itemId)}
                              />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, textDecoration: isChecked ? 'line-through' : 'none' }}>
                                  {compItem?.name ?? itemId}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {compItem?.expand?.storageLocation?.name || compItem?.storageLocation || t('Kein Lagerort', 'No storage location')}
                                  {compItem?.hint ? ` · ${compItem.hint}` : ''}
                                </Typography>
                              </Box>
                              <Chip size="small" label={`${totalNeeded}× (${perAssembly}/Kit)`} />
                              <Chip size="small" color={compAvailable >= totalNeeded ? 'success' : 'warning'} label={`${compAvailable} verf.`} />
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Collapse>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        </>
      )}

      {Boolean(orderItems.length) && (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <InventoryIcon color="primary" />
            <Typography variant="h6">{t('Einzelartikel', 'Individual items')}</Typography>
          </Stack>
          <Stack spacing={1}>
            {visibleOrderItems.map((item) => {
              const requested = order.requestedQuantities[item.id] ?? 0;
              const storedPrepared = order.preparedQuantities[item.id] ?? 0;
              const available = availableFor(item);
              const prepVal = Number(prepared[item.id] || 0);
              const isPrepComplete = prepVal === requested;

              return (
                <Card key={item.id} variant="outlined">
                  <CardContent sx={{ p: { xs: 1.25, md: 1.5 }, '&:last-child': { pb: { xs: 1.25, md: 1.5 } } }}>
                    <Stack spacing={{ xs: 1, md: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{item.name}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                            {item.expand?.storageLocation?.name || item.storageLocation || t('Kein Lagerort', 'No storage location')}
                            {item.category ? ` · ${item.category}` : ''}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', flexShrink: 0 }}>
                          {quantityChips(requested, available, storedPrepared)}
                        </Stack>
                        {order.status === 'preparing' && (
                          <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', flexShrink: 0 }}>
                            <QuantityControl label={`${item.name} ${t('Bereit', 'Prepared')}`} value={prepared[item.id] ?? ''} max={requested}
                            onChange={(value) => onSetPrepared((current) => ({ ...current, [item.id]: value }))} />
                            <Button title={translate('Die angefragte Artikelmenge als vorbereitet eintragen', 'Set the prepared item quantity to the requested amount')}
                              size="small"
                              variant={isPrepComplete ? 'contained' : 'outlined'}
                              color={isPrepComplete ? 'success' : 'primary'}
                              onClick={() => setPreparedItemMax(item.id, requested)}
                              sx={{ minWidth: 54, height: 32, fontSize: '0.75rem', px: 1 }}
                            >
                              {isPrepComplete ? 'OK' : t('Max', 'Max')}
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ display: { xs: 'flex', md: 'none' }, flexWrap: 'wrap' }}>
                        {quantityChips(requested, available, storedPrepared)}
                      </Stack>
                      {order.status === 'preparing' && (
                        <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center' }}>
                          <QuantityControl label={`${item.name} ${t('Bereit', 'Prepared')}`} value={prepared[item.id] ?? ''} max={requested}
                            onChange={(value) => onSetPrepared((current) => ({ ...current, [item.id]: value }))} />
                          <Button title={translate('Die angefragte Artikelmenge als vorbereitet eintragen', 'Set the prepared item quantity to the requested amount')}
                            size="small"
                            variant={isPrepComplete ? 'contained' : 'outlined'}
                            color={isPrepComplete ? 'success' : 'primary'}
                            onClick={() => setPreparedItemMax(item.id, requested)}
                            sx={{ ml: 'auto', minWidth: 64 }}
                          >
                            {isPrepComplete ? 'OK' : t('Max', 'Max')}
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        </>
      )}
    </>
  );
}
