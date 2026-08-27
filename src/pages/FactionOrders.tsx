import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';
import GroupsIcon from '@mui/icons-material/Groups';
import { FactionOrderForm } from '../components/forms/FactionOrderForm';
import { useCreateFactionOrder, useFactionOrders } from '../hooks/useFactionOrders';
import { useItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { EVENT_TYPES, FACTIONS_BY_EVENT, type EventType, type FactionOrder, type FactionOrderStatus } from '../types';
import { useUIStore } from '../store/uiStore';
import { useAppLanguage, useTranslate } from '../utils/naming';

function statusColor(status: FactionOrderStatus): 'default' | 'info' | 'warning' | 'success' | 'secondary' | 'error' {
  if (status === 'draft') return 'default';
  if (status === 'preparing') return 'warning';
  if (status === 'ready') return 'success';
  if (status === 'picked_up') return 'secondary';
  if (status === 'returned') return 'info';
  return 'error';
}

export function FactionOrders() {
  const t = useTranslate();
  const language = useAppLanguage();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const [eventType, setEventType] = useState<EventType>('DE');
  const [selectedFaction, setSelectedFaction] = useState(FACTIONS_BY_EVENT.DE[0]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: items = [] } = useItems();
  const { data: assemblies = [] } = useAssemblies();
  const { data: orders = [], isLoading, isError } = useFactionOrders(eventType);
  const createOrder = useCreateFactionOrder();

  const ordersByFaction = useMemo(() => Object.fromEntries(
    FACTIONS_BY_EVENT[eventType].map((faction) => [faction, orders.filter((order) => order.faction === faction)]),
  ), [eventType, orders]);

  function selectEvent(value: EventType | null) {
    if (!value) return;
    setEventType(value);
    setSelectedFaction(FACTIONS_BY_EVENT[value][0]);
  }

  function openCreate(faction?: string) {
    setSelectedFaction(faction ?? FACTIONS_BY_EVENT[eventType][0]);
    setDialogOpen(true);
  }

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

  function progress(order: FactionOrder) {
    const requested = Object.values(order.requestedQuantities).reduce((sum, value) => sum + value, 0);
    const prepared = Object.values(order.preparedQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    const requestedAssemblies = Object.values(order.requestedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    const preparedAssemblies = Object.values(order.preparedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
    return { requested: requested + requestedAssemblies, prepared: prepared + preparedAssemblies };
  }

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between' }}>
        <Box>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/events')} sx={{ mb: 1 }}>
            {t('Zur Eventplanung', 'Back to event planning')}
          </Button>
          <Typography variant="h4">{t('Fraktions-Bestelllisten', 'Faction order lists')}</Typography>
          <Typography color="text.secondary">
            {t(
              'Bedarf planen, Vorbereitung verfolgen und komplette Listen per QR-Code ausgeben und zurücknehmen.',
              'Plan requirements, track preparation, and check complete lists out and back in by QR code.',
            )}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openCreate()} sx={{ alignSelf: { sm: 'flex-start' } }}>
          {t('Neue Liste', 'New list')}
        </Button>
      </Stack>

      <ToggleButtonGroup
        exclusive
        value={eventType}
        onChange={(_event, value: EventType | null) => selectEvent(value)}
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        {EVENT_TYPES.map((type) => <ToggleButton key={type} value={type}>{type === 'LS' ? 'LightSim' : type}</ToggleButton>)}
      </ToggleButtonGroup>

      {isError && <Alert severity="error" sx={{ mb: 2 }}>{t('Bestelllisten konnten nicht geladen werden.', 'Order lists could not be loaded.')}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
          gap: 2,
          mb: 4,
        }}
      >
        {FACTIONS_BY_EVENT[eventType].map((faction) => {
          const factionOrders = ordersByFaction[faction] ?? [];
          const latest = factionOrders[0];
          const totals = latest ? progress(latest) : undefined;
          return (
            <Card key={`${eventType}-${faction}`} sx={{ borderColor: latest?.status === 'ready' ? 'success.main' : 'divider' }}>
              {latest ? (
                <CardActionArea onClick={() => navigate(`/events/orders/${latest.id}`)} sx={{ height: '100%' }}>
                  <CardContent>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Typography variant="overline" color="text.secondary">{eventType === 'LS' ? 'LightSim' : eventType}</Typography>
                        <Typography variant="h5">{faction}</Typography>
                      </Box>
                      <Chip size="small" color={statusColor(latest.status)} label={statusLabel(latest.status)} />
                    </Stack>
                    <Typography sx={{ mt: 2 }}>
                      {new Date(latest.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('Vorbereitet', 'Prepared')}: {totals?.prepared ?? 0}/{totals?.requested ?? 0} · {Object.keys(latest.requestedQuantities).length + Object.keys(latest.requestedAssemblyQuantities ?? {}).length} {t('Positionen', 'lines')}
                    </Typography>
                    <Stack direction="row" sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">
                        {factionOrders.length} {t('Listen im Verlauf', 'lists in history')}
                      </Typography>
                      <ArrowForwardIcon color="primary" />
                    </Stack>
                  </CardContent>
                </CardActionArea>
              ) : (
                <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <GroupsIcon color="primary" />
                    <Typography variant="h5">{faction}</Typography>
                  </Stack>
                  <Typography color="text.secondary" sx={{ mt: 1, mb: 2, flex: 1 }}>
                    {isLoading ? t('Wird geladen …', 'Loading …') : t('Noch keine Bestellliste vorhanden.', 'No order list yet.')}
                  </Typography>
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={() => openCreate(faction)}>
                    {t('Liste erstellen', 'Create list')}
                  </Button>
                </CardContent>
              )}
            </Card>
          );
        })}
      </Box>

      <Typography variant="h6" sx={{ mb: 1 }}>{t('Verlauf aller Listen', 'All list history')}</Typography>
      <Paper sx={{ overflow: 'hidden' }}>
        {!orders.length && !isLoading && (
          <Typography color="text.secondary" sx={{ p: 2 }}>{t('Für dieses Event gibt es noch keine Listen.', 'There are no lists for this event yet.')}</Typography>
        )}
        <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
          {orders.map((order) => {
            const totals = progress(order);
            return (
              <Button
                key={order.id}
                color="inherit"
                onClick={() => navigate(`/events/orders/${order.id}`)}
                sx={{ p: 2, borderRadius: 0, justifyContent: 'flex-start', textAlign: 'left' }}
              >
                <Stack direction="row" spacing={2} sx={{ width: '100%', alignItems: 'center' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>{order.faction}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(order.eventDate).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')} · {totals.prepared}/{totals.requested} {t('vorbereitet', 'prepared')}
                    </Typography>
                  </Box>
                  <Chip size="small" color={statusColor(order.status)} label={statusLabel(order.status)} />
                  <ArrowForwardIcon fontSize="small" />
                </Stack>
              </Button>
            );
          })}
        </Stack>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullScreen={isMobile} fullWidth maxWidth="md">
        <DialogTitle sx={{ pr: 7 }}>
          {t('Neue Fraktions-Bestellliste', 'New faction order list')}
          <IconButton onClick={() => setDialogOpen(false)} sx={{ position: 'absolute', right: 12, top: 8 }} aria-label={t('Schließen', 'Close')}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <FactionOrderForm
            items={items}
            assemblies={assemblies}
            orders={orders}
            defaultEventType={eventType}
            defaultFaction={selectedFaction}
            isLoading={createOrder.isPending}
            onSubmit={(data) => createOrder.mutate(data, {
              onSuccess: (order) => {
                setDialogOpen(false);
                showSnackbar(t('Bestellliste erstellt', 'Order list created'), 'success');
                navigate(`/events/orders/${order.id}`);
              },
              onError: (error) => showSnackbar(error instanceof Error ? error.message : t('Liste konnte nicht erstellt werden', 'Could not create list'), 'error'),
            })}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
}
