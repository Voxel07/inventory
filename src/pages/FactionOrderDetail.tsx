import { useMutationFeedback } from '../hooks/useMutationFeedback';
import { CustodyEvidence } from '../components/orders/CustodyEvidence';
import { useEquipmentAvailability } from '../hooks/useEquipment';
import { Fields } from '../components/operations/OperationForm';
import { useStockLookups } from '../hooks/useStockLookups';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, DialogContent, DialogTitle, LinearProgress, useMediaQuery, useTheme } from '@mui/material';
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
import { useItems } from '../hooks/useItems';
import { useAssemblies } from '../hooks/useAssemblies';
import { useStorageLocations } from '../hooks/useStorageLocations';
import type { Assembly, Item } from '../types';
import { useAppLanguage, useLocalizedText } from '../utils/naming';

import { assemblyAvailability } from '../utils/factionOrderQuantities';
import { getItemStock } from '../utils/stock';
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
  const { success, error: handleError } = useMutationFeedback();
  const { user } = useAuth();

  const { data: order, isLoading, isError } = useFactionOrder(orderId);
  const equipment = useEquipmentAvailability(order?.eventOccurrenceId);
  const { data: allOrders = [] } = useFactionOrders();
  const { data: items = [] } = useItems();
  const { data: assemblies = [] } = useAssemblies();
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

  const lookup = useStockLookups();
  const [sources, setSources] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<Record<string, string>>({});
  const [preparedAssemblies, setPreparedAssemblies] = useState<Record<string, string>>({});
  const [assetAssignments, setAssetAssignments] = useState<Record<string, string[]>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editReady, setEditReady] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [pickupMapOpen, setPickupMapOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const preparationKey = JSON.stringify([order?.id, order?.updated, order?.preparedQuantities, order?.preparedAssemblyQuantities, order?.assetAssignments]);
  const [preparationSource, setPreparationSource] = useState<string | undefined>(undefined);
  if (preparationSource !== preparationKey) {
    setPreparationSource(preparationKey);
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
    setAssetAssignments(Object.fromEntries(
      Object.entries(order?.assetAssignments ?? {}).map(([itemId, assets]) => [itemId, assets.map((asset) => asset.id)]),
    ));
  }

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const assemblyMap = new Map(assemblies.map((assembly) => [assembly.id, assembly]));

  const orderItems = (() => {
    if (!order) return [];
    return (order.expand?.itemIds ?? Object.keys(order.requestedQuantities).map((id) => itemMap.get(id)).filter(Boolean)) as Item[];
  })();

  const orderAssemblies = (() => {
    if (!order) return [];
    return (order.expand?.assemblyIds ?? Object.keys(order.requestedAssemblyQuantities ?? {}).map((id) => assemblyMap.get(id)).filter(Boolean)) as Assembly[];
  })();

  const orderItemCategories = [...new Set(orderItems.map((item) => item.category).filter(Boolean))];

  function availableForItemId(itemId: string) {
    const item = itemMap.get(itemId);
    if (!item) return 0;
    // The authoritative projection already subtracts every active reservation.
    // Add this order's reservation back so its own prepared units remain usable
    // while editing, without downloading the global transaction/damage ledgers.
    const ownReservation = order?.reservedQuantities?.[itemId] ?? 0;
    return Math.max(0, (equipment.data?.[itemId]?.available ?? getItemStock(item).remaining) + ownReservation);
  }

  function availableFor(item: Item) {
    return availableForItemId(item.id);
  }

  function availableAssemblies(assembly: Assembly) {
    return assemblyAvailability(assembly, availableForItemId);
  }



  function savePrepared() {
    if (!order) return;
    const values = Object.fromEntries(Object.entries(prepared).map(([id, value]) => [id, Number(value) || 0]));
    const assemblyValues = Object.fromEntries(Object.entries(preparedAssemblies).map(([id, value]) => [id, Number(value) || 0]));
    const flattened = { ...values };
    for (const assembly of orderAssemblies) {
      const count = assemblyValues[assembly.id] ?? 0;
      for (const [itemId, componentQuantity] of Object.entries(assembly.itemQuantities ?? {})) {
        flattened[itemId] = (flattened[itemId] ?? 0) + count * componentQuantity;
      }
    }
    for (const item of orderItems.filter((candidate) => candidate.trackingMode === 'serialized')) {
      const required = flattened[item.id] ?? 0;
      const selected = assetAssignments[item.id]?.length ?? 0;
      if (selected !== required) {
        handleError(new Error(t(
          `Für ${item.name} müssen genau ${required} Seriengeräte ausgewählt werden (aktuell ${selected}).`,
          `Select exactly ${required} serialized assets for ${item.name} (${selected} currently selected).`,
        )));
        return;
      }
    }
    savePreparation.mutate(
      { id: order.id, values, assemblyValues, assetAssignments, sourceLocations: Object.fromEntries(Object.entries({ ...order.sourceLocations, ...sources }).filter(([, value]) => value)) },
      {
        onSuccess: () => success(t('Vorbereitung gespeichert', 'Preparation saved')),
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
        onSuccess: () => success(t('Liste ausgegeben und Bestand gebucht', 'List checked out and stock recorded')),
        onError: handleError,
      });
    } else if (action === 'cancel') {
      cancelOrder.mutate(order.id, {
        onSuccess: () => success(t('Liste storniert', 'List cancelled')),
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
          success(t('Liste ist abholbereit', 'List is ready for pickup'));
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

  const currentUser = user;
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
  const canEditOrder = currentUser?.role !== 'read_only' && canAccessFaction(currentUser, order.eventType, order.faction);
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
            onSuccess: () => success(t('Bedarf ist bereit zur Bearbeitung — Artikel werden reserviert', 'Request submitted — items will be reserved')),
            onError: handleError,
          })
        }
        onStartPreparation={() =>
          startPreparation.mutate(order.id, {
            onSuccess: () => success(t('Vorbereitung gestartet', 'Preparation started')),
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
              onSuccess: () => success(t('Liste ist wieder in Vorbereitung', 'List moved back to preparation')),
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

      {order.status === 'preparing' && ['hq_admin', 'warehouse_crew'].includes(currentUser?.role ?? '') && <Fields fields={orderItems.filter((item) => item.trackingMode !== 'serialized').map((item) => ({ key: item.id, label: `${item.name} · ${t('Quelllager', 'Source location')}`, options: lookup.locationOptions, help: t('Leer = Standardlager des Artikels.', 'Empty = item default location.') }))} values={{ ...order.sourceLocations, ...sources }} onChange={(values) => setSources(Object.fromEntries(Object.entries(values).map(([id, value]) => [id, String(value)])))} />}
      <OrderPickListTable
        order={order}
        orderItems={orderItems}
        orderAssemblies={orderAssemblies}
        orderItemCategories={orderItemCategories}
        itemMap={itemMap}
        prepared={prepared}
        preparedAssemblies={preparedAssemblies}
        assetAssignments={assetAssignments}
        onSetPrepared={setPrepared}
        onSetPreparedAssemblies={setPreparedAssemblies}
        onSetAssetAssignments={setAssetAssignments}
        availableFor={availableFor}
        availableAssemblies={availableAssemblies}
        availableForItemId={availableForItemId}
      />

      <CustodyEvidence orderId={order.id} />
      <OrderTraceability
        order={order}
        allOrders={allOrders}
        itemMap={itemMap}
        assemblyMap={assemblyMap}
        onOpenOrder={(id) => navigate(`/orders/faction/${id}`)}
      />

      {/* Edit Order Modal */}
      <Dialog open={editOpen} fullScreen={isMobile} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth
        slotProps={{ transition: { onEntered: () => setEditReady(true), onExit: () => setEditReady(false) } }}>
        <DialogTitle>{t('Fraktionsliste bearbeiten', 'Edit faction order')}</DialogTitle>
        <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
          {editReady && <FactionOrderForm
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
                    success(t('Fraktionsliste aktualisiert', 'Faction order updated'));
                  },
                  onError: handleError,
                },
              );
            }}
            isLoading={updateOrder.isPending}
          />}
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
            onSubmit={(lines, assets) => {
              returnOrderItems.mutate(
                { id: order.id, lines, assets },
                {
                  onSuccess: () => {
                    setReturnOpen(false);
                    success(t('Rückgabe erfolgreich verbucht', 'Return successfully recorded'));
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
