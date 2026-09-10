import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, LinearProgress, useMediaQuery, useTheme } from '@mui/material';
import { FactionOrderForm } from '../components/forms/FactionOrderForm';
import { OrderReturnChecklist } from '../components/forms/OrderReturnChecklist';
import { QRCodeGenerator } from '../components/qr/QRCodeGenerator';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { OrderDetailHeader } from '../components/orders/detail/OrderDetailHeader';
import { OrderPickListTable } from '../components/orders/detail/OrderPickListTable';
import { OrderTraceability } from '../components/orders/detail/OrderTraceability';
import { OrderPickupMapDialog } from '../components/orders/detail/OrderPickupMapDialog';
import { generateOrderPdfSlip } from '../components/orders/detail/OrderPdfSlip';
import {
  useCancelFactionOrder,
  useFactionOrder,
  useFactionOrders,
  useMarkFactionOrderReady,
  usePickUpFactionOrder,
  useReopenFactionOrderPreparation,
  useReturnFactionOrderItems,
  useSaveFactionOrderPreparation,
  useStartFactionOrderPreparation,
  useSubmitFactionOrder,
  useUpdateFactionOrder,
} from '../hooks/useFactionOrders';
import { useDamageReports } from '../hooks/useDamageReports';
import { useItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { useTransactions } from '../hooks/useTransactions';
import { useStorageLocations } from '../hooks/useStorageLocations';
import { useUIStore } from '../store/uiStore';
import type { Assembly, Item, User } from '../types';
import { useAppLanguage, useLocalizedText } from '../utils/naming';
import { isOfflineQueuedError } from '../utils/offline';
import { calculateItemStock } from '../utils/stock';
import { assemblyAvailability, expandFactionOrderComponents } from '../utils/factionOrderQuantities';
import { useAuth } from '../hooks/useAuth';
import { allowedFactionKeys, canAccessFaction, canManageInventory } from '../utils/access';

type ConfirmAction = 'pickup' | 'cancel' | null;

export function FactionOrderDetail() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const t = useLocalizedText();
  const language = useAppLanguage();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const showSnackbar = useUIStore((state) => state.showSnackbar);
  const { user } = useAuth();

  const { data: order, isLoading, isError } = useFactionOrder(orderId);
  const { data: allOrders = [] } = useFactionOrders();
  const { data: items = [] } = useItems();
  const { data: assemblies = [] } = useAssemblies();
  const { data: transactions } = useTransactions();
  const { data: damageReports } = useDamageReports();
  const { data: storageLocations = [] } = useStorageLocations();

  const updateOrder = useUpdateFactionOrder();
  const submitOrder = useSubmitFactionOrder();
  const startPreparation = useStartFactionOrderPreparation();
  const savePreparation = useSaveFactionOrderPreparation();
  const markReady = useMarkFactionOrderReady();
  const reopenPreparation = useReopenFactionOrderPreparation();
  const pickUp = usePickUpFactionOrder();
  const returnOrderItems = useReturnFactionOrderItems();
  const cancelOrder = useCancelFactionOrder();

  const [prepared, setPrepared] = useState<Record<string, string>>({});
  const [preparedAssemblies, setPreparedAssemblies] = useState<Record<string, string>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [pickupMapOpen, setPickupMapOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    setPrepared(
      Object.fromEntries(
        Object.entries(order?.preparedQuantities ?? {}).map(([id, value]) => [id, String(value)]),
      ),
    );
    setPreparedAssemblies(
      Object.fromEntries(
        Object.entries(order?.preparedAssemblyQuantities ?? {}).map(([id, value]) => [id, String(value)]),
      ),
    );
  }, [order?.id, order?.preparedAssemblyQuantities, order?.preparedQuantities, order?.updated]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const assemblyMap = useMemo(() => new Map(assemblies.map((assembly) => [assembly.id, assembly])), [assemblies]);

  const orderItems = useMemo(() => {
    if (!order) return [];
    return (order.expand?.itemIds ?? Object.keys(order.requestedQuantities).map((id) => itemMap.get(id)).filter(Boolean)) as Item[];
  }, [itemMap, order]);

  const orderAssemblies = useMemo(() => {
    if (!order) return [];
    return (order.expand?.assemblyIds ?? Object.keys(order.requestedAssemblyQuantities ?? {}).map((id) => assemblyMap.get(id)).filter(Boolean)) as Assembly[];
  }, [assemblyMap, order]);

  const orderItemCategories = useMemo(
    () => [...new Set(orderItems.map((item) => item.category).filter(Boolean))],
    [orderItems],
  );

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

  function availableForItemId(itemId: string) {
    const item = itemMap.get(itemId);
    if (!item) return 0;
    const current = calculateItemStock(item.id, transactions, damageReports, item.amount ?? 0, item).remaining;
    return Math.max(0, current - (reservedByOthers[item.id] ?? 0));
  }

  function availableFor(item: Item) {
    return availableForItemId(item.id);
  }

  function availableAssemblies(assembly: Assembly) {
    return assemblyAvailability(assembly, availableForItemId);
  }

  function handleError(error: unknown) {
    if (isOfflineQueuedError(error)) return;
    showSnackbar(error instanceof Error ? error.message : t('Aktion fehlgeschlagen', 'Action failed'), 'error');
  }

  function savePrepared() {
    if (!order) return;
    const values = Object.fromEntries(Object.entries(prepared).map(([id, value]) => [id, Number(value) || 0]));
    const assemblyValues = Object.fromEntries(Object.entries(preparedAssemblies).map(([id, value]) => [id, Number(value) || 0]));
    savePreparation.mutate(
      { id: order.id, values, assemblyValues },
      {
        onSuccess: () => showSnackbar(t('Vorbereitung gespeichert', 'Preparation saved'), 'success'),
        onError: handleError,
      },
    );
  }

  function fillAvailable() {
    if (!order) return;
    const remaining = Object.fromEntries(items.map((item) => [item.id, availableFor(item)]));
    const nextItems: Record<string, string> = {};
    for (const item of orderItems) {
      const amount = Math.min(order.requestedQuantities[item.id] ?? 0, remaining[item.id] ?? 0);
      nextItems[item.id] = String(amount);
      remaining[item.id] = Math.max(0, (remaining[item.id] ?? 0) - amount);
    }
    const nextAssemblies: Record<string, string> = {};
    for (const assembly of orderAssemblies) {
      const amount = Math.min(
        order.requestedAssemblyQuantities?.[assembly.id] ?? 0,
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

  function runConfirmedAction() {
    if (!order || !confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action === 'pickup') {
      pickUp.mutate(order.id, {
        onSuccess: () => showSnackbar(t('Liste ausgegeben und Bestand gebucht', 'List checked out and stock recorded'), 'success'),
        onError: handleError,
      });
    } else if (action === 'cancel') {
      cancelOrder.mutate(order.id, {
        onSuccess: () => showSnackbar(t('Liste storniert', 'List cancelled'), 'success'),
        onError: handleError,
      });
    }
  }

  function handleTransitionReady(args: { pickupLocation: string; pickupLatitude?: number; pickupLongitude?: number; notes?: string }) {
    if (!order) return;
    markReady.mutate(
      {
        id: order.id,
        note: args.notes,
        pickupLocation: args.pickupLocation || undefined,
        pickupLatitude: args.pickupLatitude,
        pickupLongitude: args.pickupLongitude,
      },
      {
        onSuccess: () => {
          setPickupMapOpen(false);
          showSnackbar(t('Liste ist abholbereit', 'List is ready for pickup'), 'success');
        },
        onError: handleError,
      },
    );
  }

  if (isLoading) return <LinearProgress />;
  if (isError || !order) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={() => navigate('/orders?tab=faction')}>{t('Zur Übersicht', 'Back to overview')}</Button>}>
        {t('Bestellliste nicht gefunden.', 'Order list not found.')}
      </Alert>
    );
  }

  const currentUser = user as unknown as User;
  if (!canAccessFaction(currentUser, order.eventType, order.faction)) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={() => navigate('/orders?tab=faction')}>{t('Zur Übersicht', 'Back to overview')}</Button>}>
        {t('Sie haben keinen Zugriff auf diese Fraktionsliste.', 'You do not have access to this faction order.')}
      </Alert>
    );
  }

  const pickupLocation = order.expand?.pickupLocation ?? storageLocations.find((location) => location.id === order.pickupLocation);
  const pickupPoint = order.pickupLatitude != null && order.pickupLongitude != null
    ? `${order.pickupLatitude.toFixed(6)}, ${order.pickupLongitude.toFixed(6)}`
    : undefined;
  const pickupLocationLabel = pickupLocation
    ? [...[pickupLocation.name, pickupLocation.area, pickupLocation.location, pickupLocation.position].filter(Boolean), pickupPoint].filter(Boolean).join(' · ')
    : pickupPoint ?? t('Nicht angegeben', 'Not specified');

  const isManager = canManageInventory(currentUser);
  const canEditOrder = isManager || canAccessFaction(currentUser, order.eventType, order.faction);
  const canEditOrderContents = canEditOrder && ['draft', 'submitted'].includes(order.status);
  const requestedTotal = Object.values(order.requestedQuantities).reduce((sum, value) => sum + value, 0)
    + Object.values(order.requestedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
  const preparedTotal = Object.values(order.preparedQuantities ?? {}).reduce((sum, value) => sum + value, 0)
    + Object.values(order.preparedAssemblyQuantities ?? {}).reduce((sum, value) => sum + value, 0);
  const preparationComplete = requestedTotal > 0 && requestedTotal === preparedTotal;
  const progress = requestedTotal ? Math.round((preparedTotal / requestedTotal) * 100) : 0;

  return (
    <Box sx={{ pb: isMobile && isManager && order.status === 'preparing' ? 'calc(64px + env(safe-area-inset-bottom, 0px) + 84px)' : 'calc(64px + env(safe-area-inset-bottom, 0px) + 16px)' }}>
      <OrderDetailHeader
        order={order}
        orderItemsCount={orderItems.length}
        orderAssembliesCount={orderAssemblies.length}
        requestedTotal={requestedTotal}
        preparedTotal={preparedTotal}
        progress={progress}
        preparationComplete={preparationComplete}
        pickupLocation={pickupLocation}
        pickupLocationLabel={pickupLocationLabel}
        canEditOrder={canEditOrder}
        canEditOrderContents={canEditOrderContents}
        isManager={isManager}
        onBack={() => navigate('/orders?tab=faction')}
        onEdit={() => setEditOpen(true)}
        onOpenQr={() => setQrOpen(true)}
        onPrintSlip={() =>
          generateOrderPdfSlip({
            order,
            orderItems,
            orderAssemblies,
            itemMap,
            pickupLocationLabel,
            language,
            t,
          })
        }
        onSubmit={() =>
          submitOrder.mutate(order.id, {
            onSuccess: () => showSnackbar(t('Bedarf ist bereit zur Bearbeitung — Artikel werden reserviert', 'Request submitted — items will be reserved'), 'success'),
            onError: handleError,
          })
        }
        onStartPreparation={() =>
          startPreparation.mutate(order.id, {
            onSuccess: () => showSnackbar(t('Vorbereitung gestartet', 'Preparation started'), 'success'),
            onError: handleError,
          })
        }
        onFillAvailable={fillAvailable}
        onSavePrepared={savePrepared}
        onMarkReady={() => setPickupMapOpen(true)}
        onReopenPreparation={() =>
          reopenPreparation.mutate(
            { id: order.id },
            {
              onSuccess: () => showSnackbar(t('Liste ist wieder in Vorbereitung', 'List moved back to preparation'), 'success'),
              onError: handleError,
            },
          )
        }
        onPickUp={() => setConfirmAction('pickup')}
        onOpenReturn={() => setReturnOpen(true)}
        onCancel={() => setConfirmAction('cancel')}
        isSavingPreparation={savePreparation.isPending}
        isSubmitting={submitOrder.isPending}
        isStartingPreparation={startPreparation.isPending}
        isReopeningPreparation={reopenPreparation.isPending}
      />

      <OrderPickListTable
        order={order}
        orderItems={orderItems}
        orderAssemblies={orderAssemblies}
        orderItemCategories={orderItemCategories}
        itemMap={itemMap}
        prepared={prepared}
        preparedAssemblies={preparedAssemblies}
        onSetPrepared={setPrepared}
        onSetPreparedAssemblies={setPreparedAssemblies}
        availableFor={availableFor}
        availableAssemblies={availableAssemblies}
        availableForItemId={availableForItemId}
      />

      <OrderTraceability
        order={order}
        allOrders={allOrders}
        itemMap={itemMap}
        assemblyMap={assemblyMap}
        onOpenOrder={(id) => navigate(`/orders/faction/${id}`)}
      />

      {/* Edit Order Modal */}
      <Dialog open={editOpen} fullScreen={isMobile} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('Fraktionsliste bearbeiten', 'Edit faction order')}</DialogTitle>
        <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
          <FactionOrderForm
            initialData={order}
            items={items}
            assemblies={assemblies}
            storageLocations={storageLocations}
            orders={allOrders}
            allowedFactionKeys={allowedFactionKeys(currentUser) ?? undefined}
            onSubmit={(data) => {
              updateOrder.mutate(
                { id: order.id, data },
                {
                  onSuccess: () => {
                    setEditOpen(false);
                    showSnackbar(t('Fraktionsliste aktualisiert', 'Faction order updated'), 'success');
                  },
                  onError: handleError,
                },
              );
            }}
            isLoading={updateOrder.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Pickup Map & Ready Transition Dialog */}
      <OrderPickupMapDialog
        open={pickupMapOpen}
        onClose={() => setPickupMapOpen(false)}
        onConfirm={handleTransitionReady}
        initialLocationId={order.pickupLocation ?? ''}
        initialLatitude={order.pickupLatitude}
        initialLongitude={order.pickupLongitude}
        storageLocations={storageLocations}
        isTransitionMode
        isConfirming={markReady.isPending}
      />

      {/* Return Reconciliation Dialog */}
      <Dialog open={returnOpen} fullScreen={isMobile} onClose={() => setReturnOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{t('Rückgabe & Zustandserfassung', 'Return & condition inspection')}</DialogTitle>
        <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
          <OrderReturnChecklist
            order={order}
            items={orderItems}
            busy={returnOrderItems.isPending}
            onCancel={() => setReturnOpen(false)}
            onSubmit={(lines) => {
              returnOrderItems.mutate(
                { id: order.id, lines },
                {
                  onSuccess: () => {
                    setReturnOpen(false);
                    showSnackbar(t('Rückgabe erfolgreich verbucht', 'Return successfully recorded'), 'success');
                  },
                  onError: handleError,
                },
              );
            }}
          />
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={qrOpen} onClose={() => setQrOpen(false)}>
        <DialogTitle>{order.orderCode}</DialogTitle>
        <DialogContent>
          <QRCodeGenerator
            itemId={order.id}
            itemName={`${order.eventType}-${order.faction}-${order.orderCode}`}
            resourceType="faction-order"
            textCode={order.orderCode}
          />
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction === 'pickup' ? t('Liste ausgeben', 'Check out list') : t('Liste stornieren', 'Cancel order')}
        message={
          confirmAction === 'pickup'
            ? t('Möchten Sie diese Liste als abgeholt markieren und den Bestand verbuchen?', 'Do you want to mark this list as picked up and record the stock checkout?')
            : t('Sind Sie sicher, dass Sie diese Fraktionsliste stornieren möchten?', 'Are you sure you want to cancel this faction order?')
        }
        actionLabel={confirmAction === 'pickup' ? t('Ausgeben', 'Check out') : t('Stornieren', 'Cancel order')}
        actionTooltip={confirmAction === 'pickup' ? t('Ausgabe bestätigen', 'Confirm checkout') : t('Stornierung bestätigen', 'Confirm cancellation')}
        actionColor={confirmAction === 'pickup' ? 'success' : 'error'}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
        pending={pickUp.isPending || cancelOrder.isPending}
      />
    </Box>
  );
}
