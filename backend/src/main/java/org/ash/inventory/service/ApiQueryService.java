package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.AssemblyItemId;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.StorageLocation;
import org.ash.inventory.orm.GeneralOrderOrm;
import org.ash.inventory.orm.NotificationOrm;
import org.ash.inventory.orm.OperationsOrm;
import org.ash.inventory.orm.OrderOrm;
import org.ash.inventory.orm.UserOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.ApiMapper;
import org.ash.inventory.resource.dto.ApiResponses;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Transactional API query boundary. Resources delegate here so database work
 * and DTO assembly finish before REST serialization starts.
 */
@ApplicationScoped
public class ApiQueryService {
    private static final int MAX_PAGE_SIZE = 200;

    private final ActorService actors;
    private final CatalogService catalog;
    private final OrderService orderService;
    private final InventoryOperationsService inventory;
    private final OrderOrm orders;
    private final OperationsOrm operations;
    private final GeneralOrderOrm generalOrders;
    private final NotificationOrm notifications;
    private final UserOrm users;
    private final ApiMapper mapper;

    public ApiQueryService(ActorService actors, CatalogService catalog, OrderService orderService,
            InventoryOperationsService inventory, OrderOrm orders, OperationsOrm operations,
            GeneralOrderOrm generalOrders, NotificationOrm notifications, UserOrm users, ApiMapper mapper) {
        this.actors = actors;
        this.catalog = catalog;
        this.orderService = orderService;
        this.inventory = inventory;
        this.orders = orders;
        this.operations = operations;
        this.generalOrders = generalOrders;
        this.notifications = notifications;
        this.users = users;
        this.mapper = mapper;
    }

    @Transactional
    public List<ApiResponses.ItemResponse> items(String search, int page, int size) {
        actors.current();
        var bounds = bounds(page, size);
        return mapper.items(catalog.getItems(search, bounds.offset(), bounds.limit()));
    }

    @Transactional
    public ApiResponses.ItemResponse item(UUID id) {
        return mapper.item(catalog.getVisibleItem(id));
    }

    @Transactional
    public List<ApiResponses.AssetInstanceResponse> itemAssets(UUID id) {
        actors.current();
        return mapper.assets(catalog.getAssets(id));
    }

    @Transactional
    public List<ApiResponses.AssetInstanceResponse> itemAssets(UUID id, int page, int size) {
        actors.current();
        var pageBounds = bounds(page, size);
        return mapper.assets(catalog.getAssets(id, pageBounds.offset(), pageBounds.limit()));
    }

    @Transactional
    public ApiResponses.AssetInstanceResponse assetByCode(String code) {
        actors.current();
        return mapper.asset(catalog.getAssetByCode(code));
    }

    @Transactional
    public ApiResponses.StorageLocationResponse location(UUID id) {
        actors.current();
        return mapper.location(required(StorageLocation.class, id, "Storage location"));
    }

    @Transactional
    public ApiResponses.AssemblyResponse assembly(UUID id) {
        actors.current();
        return mapper.assembly(required(Assembly.class, id, "Assembly"));
    }

    @Transactional
    public ApiResponses.EventResponse event(UUID id) {
        actors.current();
        return mapper.event(required(EventOccurrence.class, id, "Event occurrence"));
    }

    @Transactional
    public List<ApiResponses.OrderSummaryResponse> orders(String eventType, String faction, String orderCode, int page, int size) {
        var actor = actors.current();
        var bounds = bounds(page, size);
        List<String> factionNames = null;
        List<String> factionKeys = null;
        if (actor.role == DomainEnums.UserRole.faction_leader) {
            factionNames = actor.factions.stream().filter(value -> !value.contains(":")).toList();
            factionKeys = actor.factions.stream().filter(value -> value.contains(":")).toList();
        }
        var values = orders.orders(eventType, faction, orderCode, factionNames, factionKeys, bounds.offset(), bounds.limit());

        var lines = orders.lines(values);
        var linesByOrder = new LinkedHashMap<UUID, List<org.ash.inventory.model.FactionOrderLine>>();
        var assemblyIds = new ArrayList<UUID>();
        for (var line : lines) {
            linesByOrder.computeIfAbsent(line.order.id, ignored -> new ArrayList<>()).add(line);
            if (line.sourceAssembly != null && !assemblyIds.contains(line.sourceAssembly.id)) {
                assemblyIds.add(line.sourceAssembly.id);
            }
        }
        var componentQuantities = new LinkedHashMap<AssemblyItemId, Integer>();
        for (var component : orders.assemblyItems(assemblyIds)) {
            componentQuantities.put(component.id, component.quantity);
        }
        return values.stream()
                .map(value -> mapper.orderSummary(value, linesByOrder.getOrDefault(value.id, List.of()), componentQuantities))
                .toList();
    }

    @Transactional
    public ApiResponses.OrderResponse order(UUID id) {
        var value = orders.findOrder(id);
        if (value == null) throw ApiException.notFound("Faction order not found");
        orderService.assertCanView(value);
        return mapper.order(value);
    }

    @Transactional
    public List<ApiResponses.TransactionResponse> transactions(UUID itemId, UUID assetInstanceId, UUID userId, String type,
            Instant start, Instant end, int page, int size) {
        actors.current();
        var bounds = bounds(page, size);
        return operations.transactions(itemId, assetInstanceId, userId, type, start, end, bounds.offset(), bounds.limit())
                .stream().map(mapper::transaction).toList();
    }

    @Transactional
    public List<ApiResponses.DamageResponse> damageReports(UUID itemId, UUID assetInstanceId, UUID assemblyId, int page, int size) {
        actors.current();
        var bounds = bounds(page, size);
        return operations.damageReports(itemId, assetInstanceId, assemblyId, bounds.offset(), bounds.limit()).stream().map(mapper::damage).toList();
    }

    @Transactional
    public List<ApiResponses.MaintenanceResponse> maintenance(UUID itemId, int page, int size) {
        actors.current();
        var bounds = bounds(page, size);
        return operations.maintenanceRecords(itemId, bounds.offset(), bounds.limit()).stream()
                .map(mapper::maintenance).toList();
    }

    @Transactional
    public List<ApiResponses.DeficitResponse> deficits(UUID eventOccurrenceId) {
        actors.requirePlanner();
        return inventory.deficits(eventOccurrenceId).stream().map(mapper::deficit).toList();
    }

    @Transactional
    public List<ApiResponses.GeneralOrderResponse> generalOrders(int page, int size) {
        actors.current();
        var bounds = bounds(page, size);
        return generalOrders.orders(bounds.offset(), bounds.limit()).stream().map(mapper::generalOrder).toList();
    }

    @Transactional
    public List<ApiResponses.NotificationResponse> notifications(int page, int size) {
        var actor = actors.current();
        var bounds = bounds(page, size);
        return notifications.forRecipient(actor, bounds.offset(), bounds.limit()).stream()
                .map(mapper::notification).toList();
    }

    @Transactional
    public ApiResponses.NotificationResponse markNotificationRead(UUID id) {
        var actor = actors.current();
        var notification = notifications.find(id);
        if (notification == null || !notification.recipient.id.equals(actor.id)) {
            throw ApiException.notFound("Notification not found");
        }
        notification.readAt = Instant.now();
        return mapper.notification(notification);
    }

    @Transactional
    public List<ApiResponses.UserResponse> users(int page, int size) {
        actors.requireAdmin();
        var bounds = bounds(page, size);
        return users.users(bounds.offset(), bounds.limit()).stream().map(mapper::user).toList();
    }

    @Transactional
    public List<ApiResponses.UserResponse> assignableUsers(int page, int size) {
        actors.requireManager();
        var bounds = bounds(page, size);
        return users.users(bounds.offset(), bounds.limit()).stream().map(mapper::user).toList();
    }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = catalog.find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }

    private PageBounds bounds(int page, int size) {
        if (page < 0) throw ApiException.badRequest("page must be zero or greater");
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("size must be between 1 and " + MAX_PAGE_SIZE);
        }
        try {
            return new PageBounds(Math.multiplyExact(page, size), size);
        } catch (ArithmeticException exception) {
            throw ApiException.badRequest("page is too large");
        }
    }

    private record PageBounds(int offset, int limit) {}
}
