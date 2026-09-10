import { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CategoryIcon from '@mui/icons-material/Category';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import RemoveIcon from '@mui/icons-material/Remove';
import SearchIcon from '@mui/icons-material/Search';
import type { Assembly, FactionOrder, Item } from '../../../types';
import { useLocalizedText } from '../../../utils/naming';

export interface OrderPickListTableProps {
  order: FactionOrder;
  orderItems: Item[];
  orderAssemblies: Assembly[];
  orderItemCategories: string[];
  itemMap: Map<string, Item>;
  prepared: Record<string, string>;
  preparedAssemblies: Record<string, string>;
  onSetPrepared: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSetPreparedAssemblies: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  availableFor: (item: Item) => number;
  availableAssemblies: (assembly: Assembly) => number;
  availableForItemId: (itemId: string) => number;
}

export function OrderPickListTable({
  order,
  orderItems,
  orderAssemblies,
  orderItemCategories,
  itemMap,
  prepared,
  preparedAssemblies,
  onSetPrepared,
  onSetPreparedAssemblies,
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

  const visibleOrderItems = useMemo(() => {
    const term = itemSearch.trim().toLocaleLowerCase();
    const filtered = orderItems.filter((item) => {
      if (itemCategory && item.category !== itemCategory) return false;
      return !term || `${item.name} ${item.category} ${item.subcategory ?? ''} ${item.sku ?? ''}`.toLocaleLowerCase().includes(term);
    });
    if (sortByLocation) {
      return [...filtered].sort((a, b) => {
        const locA = a.expand?.storageLocation?.name || a.storageLocation || '';
        const locB = b.expand?.storageLocation?.name || b.storageLocation || '';
        const cmp = locA.localeCompare(locB);
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
      });
    }
    return filtered;
  }, [itemCategory, itemSearch, orderItems, sortByLocation]);

  const visibleOrderAssemblies = useMemo(() => {
    const term = itemSearch.trim().toLocaleLowerCase();
    return orderAssemblies.filter((assembly) =>
      !term || `${assembly.name} ${assembly.description ?? ''}`.toLocaleLowerCase().includes(term),
    );
  }, [itemSearch, orderAssemblies]);

  function stepPreparedItem(itemId: string, delta: number, max: number) {
    onSetPrepared((current) => {
      const currentVal = Number(current[itemId]) || 0;
      const nextVal = Math.max(0, Math.min(max, currentVal + delta));
      return { ...current, [itemId]: String(nextVal) };
    });
  }

  function setPreparedItemMax(itemId: string, max: number) {
    onSetPrepared((current) => ({ ...current, [itemId]: String(max) }));
  }

  function stepPreparedAssembly(assemblyId: string, delta: number, max: number) {
    onSetPreparedAssemblies((current) => {
      const currentVal = Number(current[assemblyId]) || 0;
      const nextVal = Math.max(0, Math.min(max, currentVal + delta));
      return { ...current, [assemblyId]: String(nextVal) };
    });
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
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
          <TextField
            fullWidth
            size="small"
            label={t('Artikel oder Baugruppen suchen', 'Search items or assemblies')}
            value={itemSearch}
            onChange={(event) => setItemSearch(event.target.value)}
            slotProps={{ input: { startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> } }}
          />
          {Boolean(orderItems.length) && (
            <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 200 } }}>
              <InputLabel>{t('Kategorie', 'Category')}</InputLabel>
              <Select label={t('Kategorie', 'Category')} value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}>
                <MenuItem value="">{t('Alle Kategorien', 'All categories')}</MenuItem>
                {orderItemCategories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <Button
            size="small"
            variant={sortByLocation ? 'contained' : 'outlined'}
            color={sortByLocation ? 'primary' : 'inherit'}
            startIcon={<LocationOnIcon fontSize="small" />}
            onClick={() => setSortByLocation((prev) => !prev)}
            sx={{ whiteSpace: 'nowrap', minHeight: 40 }}
          >
            {t('Lagerort-Sortierung', 'Sort by location')}
          </Button>
        </Stack>
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
                            <IconButton size="small" onClick={() => stepPreparedAssembly(assembly.id, -1, requested)} disabled={prepAssemblyVal <= 0}>
                              <RemoveIcon fontSize="small" />
                            </IconButton>
                            <TextField
                              type="number"
                              size="small"
                              value={preparedAssemblies[assembly.id] ?? ''}
                              onChange={(event) => onSetPreparedAssemblies((current) => ({ ...current, [assembly.id]: event.target.value }))}
                              slotProps={{ htmlInput: { min: 0, max: requested, step: 1, inputMode: 'numeric', style: { textAlign: 'center', width: 44, padding: '4px 2px' } } }}
                            />
                            <IconButton size="small" color="primary" onClick={() => stepPreparedAssembly(assembly.id, 1, requested)} disabled={prepAssemblyVal >= requested}>
                              <AddIcon fontSize="small" />
                            </IconButton>
                            <Button
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
                        <IconButton size="small" onClick={() => toggleAssemblyExpand(assembly.id)}>
                          {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                      </Stack>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ display: { xs: 'flex', md: 'none' }, flexWrap: 'wrap' }}>
                        {quantityChips(requested, available, storedPrepared)}
                      </Stack>
                      {order.status === 'preparing' && (
                        <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center' }}>
                          <IconButton size="small" onClick={() => stepPreparedAssembly(assembly.id, -1, requested)} disabled={prepAssemblyVal <= 0}>
                            <RemoveIcon fontSize="small" />
                          </IconButton>
                          <TextField
                            type="number"
                            size="small"
                            value={preparedAssemblies[assembly.id] ?? ''}
                            onChange={(event) => onSetPreparedAssemblies((current) => ({ ...current, [assembly.id]: event.target.value }))}
                            slotProps={{ htmlInput: { min: 0, max: requested, step: 1, inputMode: 'numeric', style: { textAlign: 'center', width: 56, padding: '6px 2px' } } }}
                          />
                          <IconButton size="small" color="primary" onClick={() => stepPreparedAssembly(assembly.id, 1, requested)} disabled={prepAssemblyVal >= requested}>
                            <AddIcon fontSize="small" />
                          </IconButton>
                          <Button
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
                            <IconButton size="small" onClick={() => stepPreparedItem(item.id, -1, requested)} disabled={prepVal <= 0}>
                              <RemoveIcon fontSize="small" />
                            </IconButton>
                            <TextField
                              type="number"
                              size="small"
                              value={prepared[item.id] ?? ''}
                              onChange={(event) => onSetPrepared((current) => ({ ...current, [item.id]: event.target.value }))}
                              slotProps={{ htmlInput: { min: 0, max: requested, step: 1, inputMode: 'numeric', style: { textAlign: 'center', width: 44, padding: '4px 2px' } } }}
                            />
                            <IconButton size="small" color="primary" onClick={() => stepPreparedItem(item.id, 1, requested)} disabled={prepVal >= requested}>
                              <AddIcon fontSize="small" />
                            </IconButton>
                            <Button
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
                          <IconButton size="small" onClick={() => stepPreparedItem(item.id, -1, requested)} disabled={prepVal <= 0}>
                            <RemoveIcon fontSize="small" />
                          </IconButton>
                          <TextField
                            type="number"
                            size="small"
                            value={prepared[item.id] ?? ''}
                            onChange={(event) => onSetPrepared((current) => ({ ...current, [item.id]: event.target.value }))}
                            slotProps={{ htmlInput: { min: 0, max: requested, step: 1, inputMode: 'numeric', style: { textAlign: 'center', width: 56, padding: '6px 2px' } } }}
                          />
                          <IconButton size="small" color="primary" onClick={() => stepPreparedItem(item.id, 1, requested)} disabled={prepVal >= requested}>
                            <AddIcon fontSize="small" />
                          </IconButton>
                          <Button
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
