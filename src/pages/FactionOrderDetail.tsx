import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import InventoryIcon from '@mui/icons-material/Inventory';
import CategoryIcon from '@mui/icons-material/Category';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import ReplayIcon from '@mui/icons-material/Replay';
import SaveIcon from '@mui/icons-material/Save';
import { FactionOrderForm } from '../components/forms/FactionOrderForm';
import { QRCodeGenerator } from '../components/qr/QRCodeGenerator';
import {
  useCancelFactionOrder,
  useFactionOrder,
  useFactionOrders,
  useMarkFactionOrderReady,
  usePickUpFactionOrder,
  useReturnFactionOrder,
  useSaveFactionOrderPreparation,
  useStartFactionOrderPreparation,
  useUpdateFactionOrder,
} from '../hooks/useFactionOrders';
import { useDamageReports } from '../hooks/useDamageReports';
import { useItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { useTransactions } from '../hooks/useTransactions';
import { useUIStore } from '../store/uiStore';
import type { Assembly, FactionOrderHistoryAction, FactionOrderStatus, Item } from '../types';
import { useAppLanguage, useTranslate } from '../utils/naming';
import { calculateItemStock } from '../utils/stock';
import { assemblyAvailability, expandFactionOrderComponents } from '../utils/factionOrderQuantities';

type ConfirmAction = 'pickup' | 'return' | 'cancel' | null;

function relationName(value: { name?: string; username?: string; email?: string } | undefined, fallback?: string) {
  return value?.name || value?.username || value?.email || fallback || '—';
}

export function FactionOrderDetail() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const t = useTranslate();
  const language = useAppLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const { data: order, isLoading, isError } = useFactionOrder(orderId);
  const { data: allOrders = [] } = useFactionOrders(order?.eventType);
  const { data: items = [] } = useItems();
  const { data: assemblies = [] } = useAssemblies();
  const { data: transactions } = useTransactions();
  const { data: damageReports } = useDamageReports();
  const updateOrder = useUpdateFactionOrder();
  const startPreparation = useStartFactionOrderPreparation();
  const savePreparation = useSaveFactionOrderPreparation();
  const markReady = useMarkFactionOrderReady();
  const pickUp = usePickUpFactionOrder();
  const returnOrder = useReturnFactionOrder();
  const cancelOrder = useCancelFactionOrder();
  const [prepared, setPrepared] = useState<Record<string, string>>({});
  const [preparedAssemblies, setPreparedAssemblies] = useState<Record<string, string>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    setPrepared(Object.fromEntries(
      Object.entries(order?.preparedQuantities ?? {}).map(([id, value]) => [id, String(value)]),
    ));
    setPreparedAssemblies(Object.fromEntries(
      Object.entries(order?.preparedAssemblyQuantities ?? {}).map(([id, value]) => [id, String(value)]),
    ));
  }, [order?.id, order?.preparedAssemblyQuantities, order?.preparedQuantities, order?.updated]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const assemblyMap = useMemo(() => new Map(assemblies.map((assembly) => [assembly.id, assembly])), [assemblies]);
  const orderItems = useMemo(() => Object.keys(order?.requestedQuantities ?? {})
    .map((id) => itemMap.get(id))
    .filter((item): item is Item => Boolean(item)), [itemMap, order?.requestedQuantities]);
  const orderAssemblies = useMemo(() => Object.keys(order?.requestedAssemblyQuantities ?? {})
    .map((id) => assemblyMap.get(id))
    .filter((assembly): assembly is Assembly => Boolean(assembly)), [assemblyMap, order?.requestedAssemblyQuantities]);

  const reservedByOthers = useMemo(() => {
    const result: Record<string, number> = {};
    for (const candidate of allOrders) {
      if (candidate.id === order?.id || !['preparing', 'ready'].includes(candidate.status)) continue;
      for (const [itemId, quantity] of Object.entries(expandFactionOrderComponents(candidate, assemblies, 'prepared'))) {
        result[itemId] = (result[itemId] ?? 0) + quantity;
      }
    }
    return result;
  }, [allOrders, assemblies, order?.id]);

  const previousOrder = useMemo(() => allOrders.find((candidate) => (
    candidate.id !== order?.id
    && candidate.faction === order?.faction
    && candidate.status !== 'cancelled'
    && new Date(candidate.eventDate).getTime() <= new Date(order?.eventDate ?? 0).getTime()
  )), [allOrders, order?.eventDate, order?.faction, order?.id]);

  const comparison = useMemo(() => {
    if (!order || !previousOrder) return [];
    const ids = new Set([...Object.keys(order.requestedQuantities), ...Object.keys(previousOrder.requestedQuantities)]);
    const itemChanges = [...ids].flatMap((itemId) => {
      const before = previousOrder.requestedQuantities[itemId] ?? 0;
      const after = order.requestedQuantities[itemId] ?? 0;
      if (before === after) return [];
      return [{ resourceKey: `item-${itemId}`, before, after, name: itemMap.get(itemId)?.name ?? itemId }];
    });
    const assemblyIds = new Set([
      ...Object.keys(order.requestedAssemblyQuantities ?? {}),
      ...Object.keys(previousOrder.requestedAssemblyQuantities ?? {}),
    ]);
    const assemblyChanges = [...assemblyIds].flatMap((assemblyId) => {
      const before = previousOrder.requestedAssemblyQuantities?.[assemblyId] ?? 0;
      const after = order.requestedAssemblyQuantities?.[assemblyId] ?? 0;
      if (before === after) return [];
      return [{ resourceKey: `assembly-${assemblyId}`, before, after, name: assemblyMap.get(assemblyId)?.name ?? assemblyId }];
    });
    return [...assemblyChanges, ...itemChanges];
  }, [assemblyMap, itemMap, order, previousOrder]);

  if (isLoading) return <LinearProgress />;
  if (isError || !order) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={() => navigate('/events/orders')}>{t('Zur Übersicht', 'Back to overview')}</Button>}>
        {t('Bestellliste nicht gefunden.', 'Order list not found.')}
      </Alert>
    );
  }

  const currentOrder = order;
  const requestedTotal = Object.values(order.requestedQuantities).reduce((sum, value) => sum + value, 0)
    + Object.values(order.requestedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
  const preparedTotal = Object.values(order.preparedQuantities ?? {}).reduce((sum, value) => sum + value, 0)
    + Object.values(order.preparedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
  const preparationComplete = requestedTotal > 0 && requestedTotal === preparedTotal;
  const progress = requestedTotal ? Math.round((preparedTotal / requestedTotal) * 100) : 0;
  const componentUnitTotal = Object.values(expandFactionOrderComponents(order, assemblies, 'prepared'))
    .reduce((sum, value) => sum + value, 0);

  function statusLabel(status: FactionOrderStatus) {
    const labels: Record<FactionOrderStatus, string> = {
      draft: t('Entwurf', 'Draft'),
      preparing: t('In Vorbereitung', 'Preparing'),
      ready: t('Abholbereit', 'Ready'),
      picked_up: t('Abgeholt', 'Picked up'),
      returned: t('Zurückgegeben', 'Returned'),
      cancelled: t('Storniert', 'Cancelled'),
    };
    return labels[status];
  }

  function statusColor(status: FactionOrderStatus): 'default' | 'warning' | 'success' | 'secondary' | 'info' | 'error' {
    if (status === 'preparing') return 'warning';
    if (status === 'ready') return 'success';
    if (status === 'picked_up') return 'secondary';
    if (status === 'returned') return 'info';
    if (status === 'cancelled') return 'error';
    return 'default';
  }

  function actionLabel(action: FactionOrderHistoryAction): string {
    const labels: Record<FactionOrderHistoryAction, string> = {
      created: t('Liste erstellt', 'List created'),
      updated: t('Liste geändert', 'List updated'),
      preparation_started: t('Vorbereitung begonnen', 'Preparation started'),
      preparation_saved: t('Vorbereitung gespeichert', 'Preparation saved'),
      ready: t('Als abholbereit markiert', 'Marked ready'),
      picked_up: t('Liste abgeholt', 'List picked up'),
      returned: t('Liste zurückgegeben', 'List returned'),
      cancelled: t('Liste storniert', 'List cancelled'),
    };
    return labels[action];
  }

  function availableForItemId(itemId: string) {
    const item = itemMap.get(itemId);
    if (!item) return 0;
    const current = calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0).remaining;
    return Math.max(0, current - (reservedByOthers[item.id] ?? 0));
  }

  function availableFor(item: Item) {
    return availableForItemId(item.id);
  }

  function availableAssemblies(assembly: Assembly) {
    return assemblyAvailability(assembly, availableForItemId);
  }

  function savePrepared() {
    const values = Object.fromEntries(Object.entries(prepared).map(([id, value]) => [id, Number(value) || 0]));
    const assemblyValues = Object.fromEntries(Object.entries(preparedAssemblies).map(([id, value]) => [id, Number(value) || 0]));
    savePreparation.mutate({ id: currentOrder.id, values, assemblyValues }, {
      onSuccess: () => showSnackbar(t('Vorbereitung gespeichert', 'Preparation saved'), 'success'),
      onError: handleError,
    });
  }

  function fillAvailable() {
    const remaining = Object.fromEntries(items.map((item) => [item.id, availableFor(item)]));
    const nextItems: Record<string, string> = {};
    for (const item of orderItems) {
      const amount = Math.min(currentOrder.requestedQuantities[item.id] ?? 0, remaining[item.id] ?? 0);
      nextItems[item.id] = String(amount);
      remaining[item.id] = Math.max(0, (remaining[item.id] ?? 0) - amount);
    }
    const nextAssemblies: Record<string, string> = {};
    for (const assembly of orderAssemblies) {
      const amount = Math.min(
        currentOrder.requestedAssemblyQuantities?.[assembly.id] ?? 0,
        assemblyAvailability(assembly, (itemId) => remaining[itemId] ?? 0),
      );
      nextAssemblies[assembly.id] = String(amount);
      for (const [itemId, perAssembly] of Object.entries(assembly.itemQuantities ?? {})) {
        remaining[itemId] = Math.max(0, (remaining[itemId] ?? 0) - amount * perAssembly);
      }
    }
    setPrepared(nextItems);
    setPreparedAssemblies(nextAssemblies);
  }

  function handleError(error: unknown) {
    showSnackbar(error instanceof Error ? error.message : t('Aktion fehlgeschlagen', 'Action failed'), 'error');
  }

  function runConfirmedAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === 'pickup') {
      pickUp.mutate(currentOrder.id, {
        onSuccess: () => showSnackbar(t('Liste ausgegeben und Bestand gebucht', 'List checked out and stock recorded'), 'success'),
        onError: handleError,
      });
    } else if (action === 'return') {
      returnOrder.mutate(currentOrder.id, {
        onSuccess: () => showSnackbar(t('Liste zurückgenommen und Bestand gebucht', 'List checked in and stock recorded'), 'success'),
        onError: handleError,
      });
    } else if (action === 'cancel') {
      cancelOrder.mutate(currentOrder.id, {
        onSuccess: () => showSnackbar(t('Liste storniert', 'List cancelled'), 'success'),
        onError: handleError,
      });
    }
  }

  function itemRow(item: Item) {
    const requested = currentOrder.requestedQuantities[item.id] ?? 0;
    const storedPrepared = currentOrder.preparedQuantities[item.id] ?? 0;
    const available = availableFor(item);
    return (
      <Card key={item.id} variant="outlined">
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>{item.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {item.expand?.storageLocation?.name || item.storageLocation || t('Kein Lagerort', 'No storage location')}
                {item.category ? ` · ${item.category}` : ''}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-end' } }}>
              <Chip size="small" label={`${t('Bedarf', 'Requested')}: ${requested}`} />
              <Chip size="small" color={available >= requested ? 'success' : 'warning'} label={`${t('Verfügbar', 'Available')}: ${available}`} />
              {currentOrder.status !== 'preparing' && <Chip size="small" color={storedPrepared === requested ? 'success' : 'default'} label={`${t('Bereit', 'Prepared')}: ${storedPrepared}`} />}
            </Stack>
            {currentOrder.status === 'preparing' && (
              <TextField
                type="number"
                size="small"
                label={t('Vorbereitet', 'Prepared')}
                value={prepared[item.id] ?? ''}
                onChange={(event) => setPrepared((current) => ({ ...current, [item.id]: event.target.value }))}
                slotProps={{ htmlInput: { min: 0, max: requested, step: 1, inputMode: 'numeric' } }}
                sx={{ width: { xs: '100%', sm: 125 } }}
              />
            )}
          </Stack>
        </CardContent>
      </Card>
    );
  }

  function assemblyRow(assembly: Assembly) {
    const requested = currentOrder.requestedAssemblyQuantities?.[assembly.id] ?? 0;
    const storedPrepared = currentOrder.preparedAssemblyQuantities?.[assembly.id] ?? 0;
    const available = availableAssemblies(assembly);
    const components = Object.entries(assembly.itemQuantities ?? {})
      .map(([itemId, quantity]) => `${quantity}× ${itemMap.get(itemId)?.name ?? itemId}`)
      .join(', ');
    return (
      <Card key={assembly.id} variant="outlined" sx={{ borderColor: 'primary.dark', bgcolor: 'rgba(124, 77, 255, 0.06)' }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CategoryIcon color="primary" fontSize="small" />
                <Typography sx={{ fontWeight: 700 }}>{assembly.name}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">{components || t('Keine Komponenten', 'No components')}</Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: { xs: 'space-between', sm: 'flex-end' } }}>
              <Chip size="small" label={`${t('Bedarf', 'Requested')}: ${requested}`} />
              <Chip size="small" color={available >= requested ? 'success' : 'warning'} label={`${t('Verfügbar', 'Available')}: ${available}`} />
              {currentOrder.status !== 'preparing' && <Chip size="small" color={storedPrepared === requested ? 'success' : 'default'} label={`${t('Bereit', 'Prepared')}: ${storedPrepared}`} />}
            </Stack>
            {currentOrder.status === 'preparing' && (
              <TextField
                type="number"
                size="small"
                label={t('Vorbereitet', 'Prepared')}
                value={preparedAssemblies[assembly.id] ?? ''}
                onChange={(event) => setPreparedAssemblies((current) => ({ ...current, [assembly.id]: event.target.value }))}
                slotProps={{ htmlInput: { min: 0, max: requested, step: 1, inputMode: 'numeric' } }}
                sx={{ width: { xs: '100%', sm: 125 } }}
              />
            )}
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/events/orders')} sx={{ mb: 1 }}>
        {t('Alle Fraktionslisten', 'All faction lists')}
      </Button>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between' }}>
        <Box>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4">{order.eventType === 'LS' ? 'LightSim' : order.eventType} · {order.faction}</Typography>
            <Chip color={statusColor(order.status)} label={statusLabel(order.status)} />
          </Stack>
          <Typography color="text.secondary">
            {new Date(order.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')} · {orderItems.length + orderAssemblies.length} {t('Positionen', 'lines')} · {requestedTotal} {t('Listeneinheiten', 'list units')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button variant="outlined" startIcon={<QrCode2Icon />} onClick={() => setQrOpen(true)}>{t('Listen-QR', 'List QR')}</Button>
          {order.status === 'draft' && <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditOpen(true)}>{t('Bearbeiten', 'Edit')}</Button>}
        </Stack>
      </Stack>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" sx={{ mb: 1, justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 700 }}>{t('Vorbereitung', 'Preparation')}</Typography>
          <Typography>{preparedTotal}/{requestedTotal}</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={progress} color={preparationComplete ? 'success' : 'primary'} sx={{ height: 10, borderRadius: 5 }} />
        {order.notes && <Typography sx={{ mt: 2 }}>{order.notes}</Typography>}
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
        <Paper sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">{t('Erstellt von', 'Created by')}</Typography><Typography sx={{ fontWeight: 700 }}>{relationName(order.expand?.createdBy, order.history[0]?.userName)}</Typography></Paper>
        <Paper sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">{t('Vorbereitet von', 'Prepared by')}</Typography><Typography sx={{ fontWeight: 700 }}>{relationName(order.expand?.preparedBy)}</Typography><Typography variant="caption">{order.preparedAt ? new Date(order.preparedAt).toLocaleString() : '—'}</Typography></Paper>
        <Paper sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">{t('Abholbereit durch', 'Made ready by')}</Typography><Typography sx={{ fontWeight: 700 }}>{relationName(order.expand?.readyBy)}</Typography><Typography variant="caption">{order.readyAt ? new Date(order.readyAt).toLocaleString() : '—'}</Typography></Paper>
        <Paper sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">{t('Abgeholt von', 'Picked up by')}</Typography><Typography sx={{ fontWeight: 700 }}>{relationName(order.expand?.pickedUpBy)}</Typography><Typography variant="caption">{order.pickedUpAt ? new Date(order.pickedUpAt).toLocaleString() : '—'}</Typography></Paper>
      </Box>

      {!!orderAssemblies.length && (
        <>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <CategoryIcon color="primary" />
            <Typography variant="h6">{t('Baugruppen', 'Assemblies')}</Typography>
          </Stack>
          <Stack spacing={1.25} sx={{ mb: 2 }}>{orderAssemblies.map(assemblyRow)}</Stack>
        </>
      )}
      {!!orderItems.length && <Typography variant="h6" sx={{ mb: 1 }}>{t('Einzelartikel', 'Individual items')}</Typography>}
      <Stack spacing={1.25} sx={{ mb: 2 }}>{orderItems.map(itemRow)}</Stack>
      {orderItems.length !== Object.keys(order.requestedQuantities).length && (
        <Alert severity="warning" sx={{ mb: 2 }}>{t('Mindestens ein Artikel dieser Liste existiert nicht mehr im Lager.', 'At least one item on this list no longer exists in inventory.')}</Alert>
      )}
      {orderAssemblies.length !== Object.keys(order.requestedAssemblyQuantities ?? {}).length && (
        <Alert severity="warning" sx={{ mb: 2 }}>{t('Mindestens eine Baugruppe dieser Liste existiert nicht mehr.', 'At least one assembly on this list no longer exists.')}</Alert>
      )}

      <Paper sx={{ p: 2, mb: 3, position: { xs: 'sticky', md: 'static' }, bottom: { xs: 76, md: 'auto' }, zIndex: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {order.status === 'draft' && (
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={() => startPreparation.mutate(order.id, { onSuccess: () => showSnackbar(t('Vorbereitung gestartet', 'Preparation started'), 'success'), onError: handleError })}
              disabled={startPreparation.isPending}
            >
              {t('Vorbereitung starten', 'Start preparation')}
            </Button>
          )}
          {order.status === 'preparing' && (
            <>
              <Button variant="outlined" startIcon={<InventoryIcon />} onClick={fillAvailable}>{t('Verfügbare Mengen füllen', 'Fill available amounts')}</Button>
              <Button variant="contained" startIcon={<SaveIcon />} onClick={savePrepared} disabled={savePreparation.isPending}>{t('Fortschritt speichern', 'Save progress')}</Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon />}
                disabled={!preparationComplete || markReady.isPending}
                onClick={() => markReady.mutate(order.id, { onSuccess: () => showSnackbar(t('Liste ist abholbereit', 'List is ready for pickup'), 'success'), onError: handleError })}
              >
                {t('Abholbereit', 'Mark ready')}
              </Button>
            </>
          )}
          {order.status === 'ready' && (
            <Button variant="contained" color="success" size="large" startIcon={<LocalShippingIcon />} onClick={() => setConfirmAction('pickup')}>
              {t('Komplette Liste abholen', 'Pick up complete list')}
            </Button>
          )}
          {order.status === 'picked_up' && (
            <Button variant="contained" size="large" startIcon={<ReplayIcon />} onClick={() => setConfirmAction('return')}>
              {t('Komplette Liste zurückgeben', 'Return complete list')}
            </Button>
          )}
          {['draft', 'preparing', 'ready'].includes(order.status) && (
            <Button color="error" startIcon={<CancelIcon />} onClick={() => setConfirmAction('cancel')} sx={{ ml: { sm: 'auto' } }}>
              {t('Stornieren', 'Cancel')}
            </Button>
          )}
        </Stack>
      </Paper>

      {previousOrder && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6">{t('Änderungen zur vorherigen Liste', 'Changes from the previous list')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {new Date(previousOrder.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
          </Typography>
          {!comparison.length ? (
            <Alert severity="success">{t('Keine Mengenänderungen.', 'No quantity changes.')}</Alert>
          ) : (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {comparison.map((change) => (
                <Chip key={change.resourceKey} label={`${change.name}: ${change.before} → ${change.after}`} color={change.after > change.before ? 'primary' : 'default'} />
              ))}
            </Stack>
          )}
        </Paper>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>{t('Listenverlauf', 'List history')}</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack spacing={0} divider={<Divider flexItem />}>
          {[...(order.history ?? [])].reverse().map((entry, index) => (
            <Stack key={`${entry.timestamp}-${entry.action}-${index}`} direction="row" spacing={2} sx={{ py: 1.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: index === 0 ? 'primary.main' : 'text.disabled', mt: 0.75, flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{actionLabel(entry.action)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {entry.userName} · {new Date(entry.timestamp).toLocaleString(language === 'de' ? 'de-DE' : 'en-US')}
                </Typography>
                {entry.note && <Typography variant="body2">{entry.note}</Typography>}
              </Box>
            </Stack>
          ))}
        </Stack>
      </Paper>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullScreen={isMobile} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr: 7 }}>
          {t('Bestellliste bearbeiten', 'Edit order list')}
          <IconButton onClick={() => setEditOpen(false)} sx={{ position: 'absolute', right: 12, top: 8 }}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <FactionOrderForm
            items={items}
            assemblies={assemblies}
            orders={allOrders}
            initialData={order}
            submitLabel={t('Änderungen speichern', 'Save changes')}
            isLoading={updateOrder.isPending}
            onSubmit={(data) => updateOrder.mutate({ id: order.id, data }, {
              onSuccess: () => {
                setEditOpen(false);
                showSnackbar(t('Bestellliste aktualisiert', 'Order list updated'), 'success');
              },
              onError: handleError,
            })}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('QR-Code für die komplette Liste', 'QR code for the complete list')}</DialogTitle>
        <DialogContent>
          <QRCodeGenerator itemId={order.id} itemName={`${order.eventType}-${order.faction}`} resourceType="faction-order" />
        </DialogContent>
        <DialogActions><Button onClick={() => setQrOpen(false)}>{t('Schließen', 'Close')}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmAction)} onClose={() => setConfirmAction(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {confirmAction === 'pickup' && t('Liste wirklich abholen?', 'Pick up this list?')}
          {confirmAction === 'return' && t('Liste vollständig zurückgeben?', 'Return the complete list?')}
          {confirmAction === 'cancel' && t('Liste wirklich stornieren?', 'Cancel this list?')}
        </DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            {confirmAction === 'pickup' && t(`${componentUnitTotal} Komponenten werden auf Sie ausgeliehen.`, `${componentUnitTotal} component units will be checked out to you.`)}
            {confirmAction === 'return' && t(`${componentUnitTotal} Komponenten werden zurückgebucht. Schäden bitte anschließend separat melden.`, `${componentUnitTotal} component units will be checked in. Report any damage separately afterwards.`)}
            {confirmAction === 'cancel' && t('Die Liste bleibt im Verlauf sichtbar, kann aber nicht weiter bearbeitet werden.', 'The list remains in history but can no longer be edited.')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction(null)}>{t('Abbrechen', 'Back')}</Button>
          <Button variant="contained" color={confirmAction === 'cancel' ? 'error' : 'primary'} onClick={runConfirmedAction}>
            {t('Bestätigen', 'Confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
