import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CategoryIcon from '@mui/icons-material/Category';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import type { Assembly, EventType, FactionOrder, FactionOrderFormData, Item } from '../../types';
import { EVENT_TYPES, FACTIONS_BY_EVENT } from '../../types';
import { useTranslate } from '../../utils/naming';

interface Props {
  items: Item[];
  assemblies: Assembly[];
  orders: FactionOrder[];
  initialData?: FactionOrder;
  defaultEventType?: EventType;
  defaultFaction?: string;
  submitLabel?: string;
  isLoading?: boolean;
  onSubmit: (data: FactionOrderFormData) => void;
}

function numericValues(values: Record<string, string>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([id, value]) => [id, Number(value)] as const)
      .filter(([, value]) => Number.isInteger(value) && value > 0),
  );
}

export function FactionOrderForm({
  items,
  assemblies,
  orders,
  initialData,
  defaultEventType = 'DE',
  defaultFaction,
  submitLabel,
  isLoading,
  onSubmit,
}: Props) {
  const t = useTranslate();
  const initialEventType = initialData?.eventType ?? defaultEventType;
  const [eventType, setEventType] = useState<EventType>(initialEventType);
  const [faction, setFaction] = useState(
    initialData?.faction ?? defaultFaction ?? FACTIONS_BY_EVENT[initialEventType][0],
  );
  const [eventDate, setEventDate] = useState(
    initialData?.eventDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialData?.requestedQuantities ?? {}).map(([id, value]) => [id, String(value)])),
  );
  const [assemblyQuantities, setAssemblyQuantities] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initialData?.requestedAssemblyQuantities ?? {}).map(([id, value]) => [id, String(value)])),
  );
  const [search, setSearch] = useState('');
  const [comparison, setComparison] = useState<FactionOrder | undefined>();

  useEffect(() => {
    if (!FACTIONS_BY_EVENT[eventType].includes(faction)) setFaction(FACTIONS_BY_EVENT[eventType][0]);
  }, [eventType, faction]);

  const previousOrder = useMemo(
    () => orders.find((order) => (
      order.id !== initialData?.id
      && order.eventType === eventType
      && order.faction === faction
      && order.status !== 'cancelled'
    )),
    [eventType, faction, initialData?.id, orders],
  );

  const visibleItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return items
      .filter((item) => {
        if (Number(quantities[item.id]) > 0) return true;
        if (term) return `${item.name} ${item.category} ${item.subcategory ?? ''}`.toLocaleLowerCase().includes(term);
        return item.eventTypes?.includes(eventType);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [eventType, items, quantities, search]);

  const visibleAssemblies = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return assemblies
      .filter((assembly) => {
        if (Number(assemblyQuantities[assembly.id]) > 0) return true;
        if (term) return `${assembly.name} ${assembly.description ?? ''}`.toLocaleLowerCase().includes(term);
        return assembly.eventTypes?.includes(eventType);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assemblies, assemblyQuantities, eventType, search]);

  const currentQuantities = numericValues(quantities);
  const currentAssemblyQuantities = numericValues(assemblyQuantities);
  const changes = useMemo(() => {
    if (!comparison) return [];
    const itemIds = new Set([...Object.keys(comparison.requestedQuantities), ...Object.keys(currentQuantities)]);
    const itemChanges = [...itemIds].flatMap((itemId) => {
      const before = comparison.requestedQuantities[itemId] ?? 0;
      const after = currentQuantities[itemId] ?? 0;
      if (before === after) return [];
      const item = items.find((candidate) => candidate.id === itemId);
      return [{ resourceKey: `item-${itemId}`, name: item?.name ?? itemId, before, after }];
    });
    const assemblyIds = new Set([
      ...Object.keys(comparison.requestedAssemblyQuantities ?? {}),
      ...Object.keys(currentAssemblyQuantities),
    ]);
    const assemblyChanges = [...assemblyIds].flatMap((assemblyId) => {
      const before = comparison.requestedAssemblyQuantities?.[assemblyId] ?? 0;
      const after = currentAssemblyQuantities[assemblyId] ?? 0;
      if (before === after) return [];
      const assembly = assemblies.find((candidate) => candidate.id === assemblyId);
      return [{ resourceKey: `assembly-${assemblyId}`, name: assembly?.name ?? assemblyId, before, after }];
    });
    return [...assemblyChanges, ...itemChanges];
  }, [assemblies, comparison, currentAssemblyQuantities, currentQuantities, items]);

  function copyPrevious() {
    if (!previousOrder) return;
    setQuantities(Object.fromEntries(
      Object.entries(previousOrder.requestedQuantities).map(([id, value]) => [id, String(value)]),
    ));
    setAssemblyQuantities(Object.fromEntries(
      Object.entries(previousOrder.requestedAssemblyQuantities ?? {}).map(([id, value]) => [id, String(value)]),
    ));
    setComparison(previousOrder);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const requestedQuantities = numericValues(quantities);
    const requestedAssemblyQuantities = numericValues(assemblyQuantities);
    onSubmit({
      eventType,
      faction,
      eventDate,
      itemIds: Object.keys(requestedQuantities),
      requestedQuantities,
      assemblyIds: Object.keys(requestedAssemblyQuantities),
      requestedAssemblyQuantities,
      notes: notes.trim(),
    });
  }

  return (
    <Box component="form" onSubmit={submit}>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <FormControl fullWidth>
            <InputLabel>{t('Event', 'Event')}</InputLabel>
            <Select
              label={t('Event', 'Event')}
              value={eventType}
              onChange={(event) => setEventType(event.target.value as EventType)}
            >
              {EVENT_TYPES.map((type) => <MenuItem key={type} value={type}>{type === 'LS' ? 'LightSim' : type}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>{t('Fraktion', 'Faction')}</InputLabel>
            <Select label={t('Fraktion', 'Faction')} value={faction} onChange={(event) => setFaction(event.target.value)}>
              {FACTIONS_BY_EVENT[eventType].map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            type="date"
            label={t('Eventdatum', 'Event date')}
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            required
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
          <Button
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={copyPrevious}
            disabled={!previousOrder}
          >
            {t('Letzte Liste übernehmen', 'Copy previous list')}
          </Button>
          {previousOrder && (
            <Typography variant="body2" color="text.secondary">
              {t('Vorlage vom', 'Template from')} {new Date(previousOrder.eventDate).toLocaleDateString()}
            </Typography>
          )}
        </Stack>

        {comparison && (
          <Alert severity={changes.length ? 'info' : 'success'}>
            <Typography variant="subtitle2">
              {changes.length
                ? t(`${changes.length} Änderungen zur vorherigen Liste`, `${changes.length} changes from the previous list`)
                : t('Keine Änderungen zur vorherigen Liste', 'No changes from the previous list')}
            </Typography>
            {changes.length > 0 && (
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
                {changes.map((change) => (
                  <Chip
                    key={change.resourceKey}
                    size="small"
                    label={`${change.name}: ${change.before} → ${change.after}`}
                    color={change.after > change.before ? 'primary' : 'default'}
                  />
                ))}
              </Stack>
            )}
          </Alert>
        )}

        <Divider />
        <Box>
          <Typography variant="h6">{t('Baugruppen und Artikel', 'Assemblies and items')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t(
              'Für dieses Event markierte Einträge werden direkt angezeigt. Nur Einträge mit einer Menge größer als 0 werden bestellt.',
              'Entries tagged for this event are shown directly. Only entries with a quantity greater than 0 are ordered.',
            )}
          </Typography>
          <TextField
            fullWidth
            size="small"
            label={t('Baugruppen oder Artikel suchen', 'Search assemblies or items')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Box>

        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <CategoryIcon color="primary" />
            <Typography variant="h6">{t('Benötigte Baugruppen', 'Requested assemblies')}</Typography>
          </Stack>
          <Stack spacing={1} sx={{ maxHeight: { xs: '36vh', sm: 300 }, overflowY: 'auto', pr: 0.5 }}>
            {visibleAssemblies.map((assembly) => {
              const isSelected = Number(assemblyQuantities[assembly.id]) > 0;
              return (
              <Stack
                key={assembly.id}
                direction="row"
                spacing={1.5}
                sx={{ p: 1.25, border: 1, borderColor: 'primary.dark', bgcolor: 'rgba(124, 77, 255, 0.06)', borderRadius: 2, alignItems: 'center' }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }} noWrap>{assembly.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {Object.keys(assembly.itemQuantities ?? {}).length} {t('Komponenten', 'components')}
                  </Typography>
                </Box>
                <TextField
                  type="number"
                  size="small"
                  label={t('Menge', 'Qty')}
                  value={assemblyQuantities[assembly.id] ?? ''}
                  onChange={(event) => setAssemblyQuantities((current) => ({ ...current, [assembly.id]: event.target.value }))}
                  slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }}
                  sx={{ width: 96 }}
                />
                {isSelected && (
                  <Tooltip title={t('Von der Liste entfernen', 'Remove from list')}>
                    <IconButton
                      color="error"
                      aria-label={t(`${assembly.name} von der Liste entfernen`, `Remove ${assembly.name} from list`)}
                      onClick={() => setAssemblyQuantities((current) => {
                        const next = { ...current };
                        delete next[assembly.id];
                        return next;
                      })}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
              );
            })}
            {!visibleAssemblies.length && <Typography color="text.secondary">{t('Keine passenden Baugruppen.', 'No matching assemblies.')}</Typography>}
          </Stack>
        </Box>

        <Box>
          <Typography variant="h6">{t('Benötigte Artikel', 'Requested items')}</Typography>
          <Stack spacing={1} sx={{ maxHeight: { xs: '48vh', sm: 420 }, overflowY: 'auto', pr: 0.5 }}>
            {visibleItems.map((item) => {
              const isSelected = Number(quantities[item.id]) > 0;
              return (
              <Stack
                key={item.id}
                direction="row"
                spacing={1.5}
                sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2, alignItems: 'center' }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>{item.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.category || '—'}</Typography>
                </Box>
                <TextField
                  type="number"
                  size="small"
                  label={t('Menge', 'Qty')}
                  value={quantities[item.id] ?? ''}
                  onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                  slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }}
                  sx={{ width: 96 }}
                />
                {isSelected && (
                  <Tooltip title={t('Von der Liste entfernen', 'Remove from list')}>
                    <IconButton
                      color="error"
                      aria-label={t(`${item.name} von der Liste entfernen`, `Remove ${item.name} from list`)}
                      onClick={() => setQuantities((current) => {
                        const next = { ...current };
                        delete next[item.id];
                        return next;
                      })}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
              );
            })}
            {!visibleItems.length && <Typography color="text.secondary">{t('Keine passenden Artikel.', 'No matching items.')}</Typography>}
          </Stack>
        </Box>

        <TextField
          label={t('Anmerkungen', 'Notes')}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          multiline
          minRows={2}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          disabled={isLoading || (Object.keys(currentQuantities).length === 0 && Object.keys(currentAssemblyQuantities).length === 0)}
        >
          {submitLabel ?? t('Bestellliste erstellen', 'Create order list')}
        </Button>
      </Stack>
    </Box>
  );
}
