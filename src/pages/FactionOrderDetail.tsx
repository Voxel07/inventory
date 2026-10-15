import { Button } from '../components/shared/ActionButtons';
import { useMutationFeedback } from '../hooks/useMutationFeedback';
import { CustodyEvidence } from '../components/orders/CustodyEvidence';
import { useEquipmentAvailability } from '../hooks/useEquipment';
import { Dialog } from '../components/shared/ClosableDialog';
import { useState, type SetStateAction } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, DialogContent, DialogTitle, LinearProgress, useMediaQuery, useTheme } from '@mui/material';
import { FactionOrderForm } from '../components/forms/FactionOrderForm';
import { OrderReturnChecklist } from '../components/forms/OrderReturnChecklist';
import { QrLabelDialog } from '../components/qr/QrLabelDialog';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { OrderDetailHeader } from '../components/orders/detail/OrderDetailHeader';
import { OrderPickListTable } from '../components/orders/detail/OrderPickListTable';
import { OrderPickupGroups } from '../components/orders/OrderPickupGroups';
import { useQuery } from '@tanstack/react-query';
import { orderPickupApi } from '../services/orderPickupService';
import { OrderTraceability } from '../components/orders/detail/OrderTraceability';
import { OrderPickupMapDialog } from '../components/orders/detail/OrderPickupMapDialog';
import { generateOrderPdfSlip } from '../components/orders/detail/OrderPdfSlip';
import {
  useCancelFactionOrder,
  useFactionOrder,
  useMarkFactionOrderReady,
  usePickUpFactionOrder,
  useReopenFactionOrderPreparation,
  useReturnFactionOrderItems,
  useSaveFactionOrderPreparation,
  useStartFactionOrderPreparation,
  useSubmitFactionOrder,
  useUpdateFactionOrder,
} from '../hooks/useFactionOrders';
import { useItemsByIds } from '../hooks/useItems';
import { loadAllPages } from '../services/apiPagination';
import { getFactionOrders } from '../services/factionOrderService';
import { useAssemblies } from '../hooks/useAssemblies';
import { useStorageLocations } from '../hooks/useStorageLocations';
import type { Assembly, FactionOrder, Item } from '../types';
import { translate, useT } from '../utils/naming';

import { assemblyAvailability } from '../utils/factionOrderQuantities';
import { getItemStock } from '../utils/stock';
import { useAuth } from '../hooks/useAuth';
import { canManageInventory, canViewFaction, canWriteFaction, canWriteOff } from '../utils/access';

type ConfirmAction = 'pickup' | 'cancel' | null;

function preparationDraft(key: string, order?: FactionOrder) {
  return {
    key,
    prepared: Object.fromEntries(Object.entries(order?.preparedQuantities ?? {}).map(([id, value]) => [id, String(value)])),
    preparedAssemblies: Object.fromEntries(Object.entries(order?.preparedAssemblyQuantities ?? {}).map(([id, value]) => [id, String(value)])),
    assetAssignments: Object.fromEntries(Object.entries(order?.assetAssignments ?? {}).map(([id, assets]) => [id, assets.map((asset) => asset.id)])),
  };
}

type PreparationDraft = ReturnType<typeof preparationDraft>;

export function FactionOrderDetail() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const t = useT();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { success, error: handleError } = useMutationFeedback();
  const { user, generation } = useAuth();

  const { data: order, isLoading, isError } = useFactionOrder(orderId);
  const pickupGroups = useQuery({ queryKey: ['order-pickup-groups', 'faction', orderId], queryFn: () => orderPickupApi.get('faction', orderId), enabled: Boolean(orderId) });
  const equipment = useEquipmentAvailability(order?.eventOccurrenceId);
  // Exactly this order's items (lines and assembly components) and this faction's orders, never the catalog.
  const { data: allOrders = [] } = useQuery({ queryKey: ['faction-orders', 'faction', order?.eventType, order?.faction],
    enabled: Boolean(order), networkMode: 'offlineFirst',
    queryFn: () => loadAllPages((page, size) => getFactionOrders({ eventType: order!.eventType, faction: order!.faction }, page, size)) });
  const { data: assemblies = [] } = useAssemblies();
  const lineIds = [...Object.keys(order?.requestedQuantities ?? {}), ...(order?.expand?.assemblyIds ?? []).flatMap((assembly) => Object.keys(assembly.itemQuantities ?? {}))];
  const { data: lineLookup = [] } = useItemsByIds(lineIds);
  const items = [...new Map([...(order?.expand?.itemIds ?? []), ...lineLookup].map((item) => [item.id, item])).values()];
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

  const preparationKey = JSON.stringify([
    generation, orderId, order?.id, order?.updated, order?.status,
    order?.requestedQuantities, order?.requestedAssemblyQuantities,
    order?.preparedQuantities, order?.preparedAssemblyQuantities,
    Object.entries(order?.assetAssignments ?? {}).map(([id, assets]) => [id, assets.map((asset) => asset.id)]),
  ]);
  const [draft, setDraft] = useState(() => preparationDraft(preparationKey, order));
  // Keep edits on unchanged refetches and failed saves. A new order, saved
  // revision/preparation or permission generation replaces every field together.
  if (draft.key !== preparationKey) setDraft(preparationDraft(preparationKey, order));
  const { prepared, preparedAssemblies, assetAssignments } = draft;
  function setPreparationField<K extends Exclude<keyof PreparationDraft, 'key'>>(field: K, value: SetStateAction<PreparationDraft[K]>) {
    setDraft((current) => ({
      ...current,
      [field]: typeof value === 'function' ? value(current[field]) : value,
    }));
  }
  const setPrepared = (value: SetStateAction<PreparationDraft['prepared']>) => setPreparationField('prepared', value);
  const setPreparedAssemblies = (value: SetStateAction<PreparationDraft['preparedAssemblies']>) => setPreparationField('preparedAssemblies', value);
  const setAssetAssignments = (value: SetStateAction<PreparationDraft['assetAssignments']>) => setPreparationField('assetAssignments', value);
  const [editOpen, setEditOpen] = useState(false);
  const [editReady, setEditReady] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [pickupMapOpen, setPickupMapOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const assemblyMap = new Map(assemblies.map((assembly) => [assembly.id, assembly]));

  // Every item on an order line, including assembly components. Serialized pickers and returns work on these.
  const lineItems = (() => {
    if (!order) return [];
    return order.expand?.itemIds ?? Object.keys(order.requestedQuantities).map((id) => itemMap.get(id)).filter((item): item is Item => Boolean(item));
  })();
  // Only items ordered on their own; assembly components are listed under their assembly.
  const orderItems = lineItems.filter((item) => item.id in (order?.requestedQuantities ?? {}));

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
    for (const item of lineItems.filter((candidate) => candidate.trackingMode === 'serialized')) {
      const required = flattened[item.id] ?? 0;
      const selected = assetAssignments[item.id]?.length ?? 0;
      if (selected !== required) {
        handleError(new Error(t('pages.factionOrderDetail.selectExactlyRequiredSerializedAssetsForNameSelectedCurrentlySelected', { name: String(item.name), required: required, selected: selected })));
        return;
      }
    }
    savePreparation.mutate(
      // No source locations: the backend takes the item's default location, or the location with free stock.
      { order, values, assemblyValues, assetAssignments },
      {
        onSuccess: () => success(t('pages.factionOrderDetail.preparationSaved')),
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
    setDraft((current) => ({ ...current, prepared: nextItems, preparedAssemblies: nextAssemblies }));
  }

  function runConfirmedAction() {
    if (!order || !confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action === 'pickup') {
      pickUp.mutate(order.id, {
        onSuccess: () => success(t('pages.factionOrderDetail.listCheckedOutAndStockRecorded')),
        onError: handleError,
      });
    } else if (action === 'cancel') {
      cancelOrder.mutate(order.id, {
        onSuccess: () => success(t('pages.factionOrderDetail.listCancelled')),
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
          success(t('pages.factionOrderDetail.listIsReadyForPickup'));
        },
        onError: handleError,
      },
    );
  }

  if (isLoading) return <LinearProgress />;
  if (isError || !order) {
    return (
      <Alert severity="error" action={<Button title={translate('pages.factionOrderDetail.returnToTheFactionOrderOverview')} color="inherit" onClick={() => navigate('/orders?tab=faction')}>{t('pages.factionOrderDetail.backToOverview')}</Button>}>
        {t('pages.factionOrderDetail.orderListNotFound')}
      </Alert>
    );
  }

  const currentUser = user;
  if (!canViewFaction(currentUser)) {
    return (
      <Alert severity="error" action={<Button title={translate('pages.factionOrderDetail.returnToTheFactionOrderOverview')} color="inherit" onClick={() => navigate('/orders?tab=faction')}>{t('pages.factionOrderDetail.backToOverview')}</Button>}>
        {t('pages.factionOrderDetail.youDoNotHaveAccessToThisFactionOrder')}
      </Alert>
    );
  }

  const pickupLocation = order.expand?.pickupLocation ?? storageLocations.find((location) => location.id === order.pickupLocation);
  const pickupPoint = order.pickupLatitude != null && order.pickupLongitude != null
    ? `${order.pickupLatitude.toFixed(6)}, ${order.pickupLongitude.toFixed(6)}`
    : undefined;
  const pickupLocationLabel = pickupGroups.data?.pickupPointsComplete
    ? pickupGroups.data.groups.map(group => `${group.name}: ${group.pickupLocationName}`).join(' · ')
    : pickupLocation
    ? [...[pickupLocation.name, pickupLocation.area, pickupLocation.location, pickupLocation.position].filter(Boolean), pickupPoint].filter(Boolean).join(' · ')
    : pickupPoint ?? t('pages.factionOrderDetail.notSpecified');

  const isManager = canManageInventory(currentUser);
  const canEditOrder = canWriteFaction(currentUser, order.factionKey);
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
            t,
          })
        }
        onSubmit={() =>
          submitOrder.mutate(order.id, {
            onSuccess: () => success(t('pages.factionOrderDetail.requestSubmittedItemsWillBeReserved')),
            onError: handleError,
          })
        }
        onStartPreparation={() =>
          startPreparation.mutate(order.id, {
            onSuccess: () => success(t('pages.factionOrderDetail.preparationStarted')),
            onError: handleError,
          })
        }
        onFillAvailable={fillAvailable}
        onSavePrepared={savePrepared}
        onMarkReady={() => {
          if (pickupGroups.data?.pickupPointsComplete) handleTransitionReady({ pickupLocation: '' });
          else setPickupMapOpen(true);
        }}
        onReopenPreparation={() =>
          reopenPreparation.mutate(
            { id: order.id },
            {
              onSuccess: () => success(t('pages.factionOrderDetail.listMovedBackToPreparation')),
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

      <OrderPickupGroups kind="faction" orderId={order.id} />
      {/* From preparation on, staff need the kit breakdown and reserved serial numbers; it is read-only after preparing. */}
      {!['draft', 'submitted'].includes(order.status) && <OrderPickListTable
        order={order}
        orderItems={orderItems}
        lineItems={lineItems}
        orderAssemblies={orderAssemblies}
        orderItemCategories={orderItemCategories}
        itemMap={itemMap}
        prepared={prepared}
        preparedAssemblies={preparedAssemblies}
        assetAssignments={assetAssignments}
        onSetPrepared={setPrepared}
        onSetPreparedAssemblies={setPreparedAssemblies}
        onSetAssetAssignments={setAssetAssignments}
      />}

      <CustodyEvidence orderId={order.id} />
      <OrderTraceability
        key={order.id}
        order={order}
        allOrders={allOrders}
        itemMap={itemMap}
        assemblyMap={assemblyMap}
        onOpenOrder={(id) => navigate(`/orders/faction/${id}`)}
      />

      {/* Edit Order Modal */}
      <Dialog open={editOpen} fullScreen={isMobile} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth
        slotProps={{ transition: { onEntered: () => setEditReady(true), onExit: () => setEditReady(false) } }}>
        <DialogTitle>{t('pages.factionOrderDetail.editFactionOrder')}</DialogTitle>
        <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
          {editReady && <FactionOrderForm
            initialData={order}
            assemblies={assemblies}
            storageLocations={storageLocations}
            submitLabel={t('pages.factionOrderDetail.updateOrderList')}
            onSubmit={(data) => {
              updateOrder.mutate(
                { id: order.id, data },
                {
                  onSuccess: () => {
                    setEditOpen(false);
                    success(t('pages.factionOrderDetail.factionOrderUpdated'));
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
        <DialogTitle>{t('pages.factionOrderDetail.returnConditionInspection')}</DialogTitle>
        <DialogContent sx={{ pt: 2, overflow: 'visible' }}>
          <OrderReturnChecklist
            order={order}
            items={lineItems}
            busy={returnOrderItems.isPending}
            canWriteOff={canWriteOff(currentUser)}
            onCancel={() => setReturnOpen(false)}
            onSubmit={(lines, assets) => {
              returnOrderItems.mutate(
                { id: order.id, lines, assets },
                {
                  onSuccess: () => {
                    setReturnOpen(false);
                    success(t('pages.factionOrderDetail.returnSuccessfullyRecorded'));
                  },
                  onError: handleError,
                },
              );
            }}
          />
        </DialogContent>
      </Dialog>

      <QrLabelDialog
        label={qrOpen ? { title: order.orderCode, itemId: order.id, itemName: `${order.eventType}-${order.faction}-${order.orderCode}`, resourceType: 'faction-order', textCode: order.orderCode } : null}
        onClose={() => setQrOpen(false)} />

      {/* Action Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction === 'pickup' ? t('pages.factionOrderDetail.checkOutList') : t('pages.factionOrderDetail.cancelOrder')}
        message={
          confirmAction === 'pickup'
            ? t('pages.factionOrderDetail.doYouWantToMarkThisListAsPickedUp')
            : t('pages.factionOrderDetail.areYouSureYouWantToCancelThisFactionOrder')
        }
        actionLabel={confirmAction === 'pickup' ? t('pages.factionOrderDetail.checkOut') : t('pages.factionOrderDetail.cancelOrder2')}
        actionTooltip={confirmAction === 'pickup' ? t('pages.factionOrderDetail.confirmCheckout') : t('pages.factionOrderDetail.confirmCancellation')}
        actionColor={confirmAction === 'pickup' ? 'success' : 'error'}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirmedAction}
        pending={pickUp.isPending || cancelOrder.isPending}
      />
    </Box>
  );
}
