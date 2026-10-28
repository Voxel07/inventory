package org.ash.inventory.operations.internal.application;

import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.OrderItemRequest;
import org.ash.inventory.operations.internal.persistence.OrderOrm;
import org.ash.inventory.operations.internal.projection.ApiMapper;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/**
 * Procurement side of order requests for things the inventory does not hold: link an item (created for the
 * request or already in the catalog) or decline with a reason the requester is told. Ordering happens through
 * purchase orders, which pick up linked requests on their own.
 */
@ApplicationScoped
public class ItemRequestService {
    public static final String DECLINED = "item_request_declined";

    @Inject OrderOrm orm;
    @Inject OrderService orders;
    @Inject ActorService actors;
    @Inject NotificationService notifications;
    @Inject ApiMapper mapper;

    @Transactional
    public List<ApiResponses.ItemRequestQueueEntry> queue(UUID eventId, boolean includeResolved) {
        actors.requireAdmin();
        // Stable sort: waiting requests first, each status oldest first.
        return orm.itemRequestQueue(eventId, includeResolved).stream()
                .sorted(Comparator.comparingInt(request -> request.status().ordinal()))
                .map(mapper::itemRequestQueueEntry).toList();
    }

    @Transactional
    @PrivateInventoryCommand
    public ApiResponses.ItemRequestQueueEntry assignItem(UUID id, UUID itemId) {
        actors.requireAdmin();
        var request = lockedRequest(id);
        if (request.status() != OrderItemRequest.Status.open) throw ApiException.conflict("Only open requests can be linked to an item");
        var item = orm.require(Item.class, itemId, "Item");
        if (!item.active) throw ApiException.conflict("Item is inactive");
        request.item = item;
        request.resolvedBy = actors.current();
        orders.attachRequestedItem(request, request.resolvedBy);
        return mapper.itemRequestQueueEntry(request);
    }

    @Transactional
    @PrivateInventoryCommand
    public ApiResponses.ItemRequestQueueEntry decline(UUID id, String reason) {
        actors.requireAdmin();
        if (reason == null || reason.isBlank()) throw ApiException.badRequest("A reason is required to decline a request");
        var request = lockedRequest(id);
        var status = request.status();
        if (status != OrderItemRequest.Status.open && status != OrderItemRequest.Status.item_created)
            throw ApiException.conflict("Only requests that are not ordered yet can be declined");
        request.declineReason = reason.trim();
        request.declinedAt = Instant.now();
        request.resolvedBy = actors.current();
        orders.recordRequestDecline(request, request.resolvedBy);
        notifyRequester(request);
        return mapper.itemRequestQueueEntry(request);
    }

    private OrderItemRequest lockedRequest(UUID id) {
        var request = orm.findLockedItemRequest(id);
        if (request == null) throw ApiException.notFound("Item request not found");
        // Serializes with edits of the order, which replace its open requests.
        orm.lock(request.order);
        if (request.order.status == DomainEnums.OrderStatus.cancelled)
            throw ApiException.conflict("The order was cancelled");
        return request;
    }

    private void notifyRequester(OrderItemRequest request) {
        var order = request.order;
        if (order.createdBy.id.equals(request.resolvedBy.id)) return;
        boolean faction = order.kind == InventoryOrder.Kind.faction;
        var payload = new LinkedHashMap<String, Object>();
        payload.put("requestName", request.name);
        payload.put("reason", request.declineReason);
        payload.put("reference", order.label());
        payload.put("path", faction ? "/orders/faction/" + order.id : "/orders?tab=general");
        notifications.enqueue(order.createdBy.id, faction ? order.id : null, DECLINED, DECLINED + ":" + request.id, payload);
    }
}
