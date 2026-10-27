package org.ash.inventory.operations.internal.application;

import org.ash.inventory.integration.api.DomainEventService;
import org.ash.inventory.notification.api.NotificationService;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.Assembly;
import org.ash.inventory.operations.internal.model.AssemblyItem;
import org.ash.inventory.operations.internal.model.AssemblyItemId;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.EventOccurrence;
import org.ash.inventory.operations.internal.model.InventoryOrder;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.model.OrderLine;
import org.ash.inventory.operations.internal.model.StorageLocation;
import org.ash.inventory.operations.internal.persistence.CatalogOrm;
import org.ash.inventory.operations.internal.persistence.EntityOrm;
import org.ash.inventory.operations.internal.persistence.OperationsOrm;
import org.ash.inventory.operations.internal.persistence.OrderOrm;
import org.ash.inventory.operations.internal.persistence.PurchasingOrm;
import org.ash.inventory.operations.internal.persistence.UserOrm;
import org.ash.inventory.operations.internal.projection.ApiMapper;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.operations.internal.security.PrivateInventoryCommand;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.api.PageBounds;
import org.ash.inventory.platform.persistence.ConsistentRead;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
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

    private final ActorService actors;
    private final CatalogService catalog;
    private final OrderService orderService;
    private final InventoryOperationsService inventory;
    private final OrderOrm orders;
    private final OperationsOrm operations;
    private final NotificationService notifications;
    private final UserOrm users;
    private final ApiMapper mapper;
    @jakarta.inject.Inject PlanningService planning;
    @jakarta.inject.Inject CustodyBalanceService custody;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.persistence.CatalogOrm catalogOrm;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.persistence.PurchasingOrm purchasing;
    @jakarta.inject.Inject EventMetricsService eventMetrics;
    @jakarta.inject.Inject InventoryAccessService accessPolicies;
    @jakarta.inject.Inject DomainEventService outbox;
    @jakarta.inject.Inject com.fasterxml.jackson.databind.ObjectMapper json;
    @jakarta.inject.Inject org.ash.inventory.operations.internal.persistence.SourceRevisionOrm revisions;
    @jakarta.inject.Inject @io.quarkus.cache.CacheName("inventory-summary") io.quarkus.cache.Cache summaries;

    public ApiQueryService(ActorService actors, CatalogService catalog, OrderService orderService,
            InventoryOperationsService inventory, OrderOrm orders, OperationsOrm operations,
            NotificationService notifications, UserOrm users, ApiMapper mapper) {
        this.actors = actors;
        this.catalog = catalog;
        this.orderService = orderService;
        this.inventory = inventory;
        this.orders = orders;
        this.operations = operations;
        this.notifications = notifications;
        this.users = users;
        this.mapper = mapper;
    }

    @org.ash.inventory.platform.persistence.ConsistentRead
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    /** {@code mine}: private items the actor owns and items in the actor's custody. */
    public List<ApiResponses.ItemResponse> items(String search, String category, String eventType, boolean includeUntagged,
            List<UUID> locationIds, List<UUID> ids, boolean mine, String sort, boolean maintenanceAttention, int page, int size) {
        var actor = actors.current();
        var bounds = bounds(page, size);
        var held = mine ? custody.list(true).stream().filter(balance -> balance.checkedOut() > 0)
                .map(CustodyBalanceService.Balance::itemId).distinct().toList() : List.<UUID>of();
        var filter = new org.ash.inventory.operations.internal.persistence.CatalogOrm.ItemFilter(search, category, eventType, includeUntagged, locationIds, ids,
                mine ? actor.id : null, held, sort, maintenanceAttention);
        return projectItems(catalog.getItems(filter, bounds.offset(), bounds.limit()));
    }

    /**
     * Overview counts over the caller's visible catalog, ledger and damage, without sending the catalog. Administrators
     * see everything, so their counts are shared under the commit-ordered stock revision; the minute bucket bounds the
     * sliding seven-day movement window. Every dashboard refetches after a change, which would otherwise repeat the
     * whole-catalog read once per administrator.
     */
    @Transactional
    public ApiResponses.InventorySummaryResponse summary() {
        var actor = actors.current();
        actors.requireReader();
        if (actor.role != DomainEnums.UserRole.admin) return computeSummary(actor);
        String key = revisions.reportToken("availability") + "|" + Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MINUTES);
        return summaries.<String, ApiResponses.InventorySummaryResponse>get(key, ignored -> computeSummary(actor))
                .await().atMost(java.time.Duration.ofSeconds(30));
    }

    private ApiResponses.InventorySummaryResponse computeSummary(org.ash.inventory.operations.internal.model.UserAccount actor) {
        var ids = catalog.getVisibleItemIds();
        long units = 0, low = 0;
        for (int from = 0; from < ids.size(); from += 500) {
            var items = catalogOrm.itemsByIds(ids.subList(from, Math.min(ids.size(), from + 500)));
            var stock = inventory.stock(items);
            for (var item : items) {
                var state = stock.get(item.id);
                if (state == null) continue;
                units += state.onHand() + state.checkedOut() + state.inTransit();
                if (state.available() <= item.minStock) low++;
            }
        }
        return new ApiResponses.InventorySummaryResponse(ids.size(), units, low,
                operations.visibleTransactionsSince(actor, java.time.Instant.now().minus(java.time.Duration.ofDays(7))),
                operations.visibleOpenDamageReports(actor));
    }

    @org.ash.inventory.platform.persistence.ConsistentRead
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public ApiResponses.ItemResponse item(UUID id) {
        return projectItem(catalog.getVisibleItem(id));
    }

    @org.ash.inventory.platform.persistence.ConsistentRead
    @Transactional(Transactional.TxType.REQUIRES_NEW)
    public ApiResponses.ItemResponse itemBySku(String sku) {
        actors.current();
        return projectItem(catalogOrm.itemBySku(sku));
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
        return mapper.assets(catalog.getAssets(id, null, pageBounds.offset(), pageBounds.limit()));
    }

    @Transactional
    public ApiResponses.AssetInstanceResponse assetByCode(String code) {
        actors.current();
        return mapper.asset(catalog.getAssetByCode(code));
    }

    @Transactional
    public ApiResponses.StorageLocationResponse location(UUID id) {
        actors.current();
        var location = org.ash.inventory.operations.internal.persistence.EntityOrm.found(catalog.find(StorageLocation.class, id), "Storage location");
        actors.requireLocationAccess(location, false);
        return mapper.location(location);
    }

    @Transactional
    public List<ApiResponses.AssemblyResponse> assemblies(String search, String eventTag, boolean mine, int page, int size) {
        actors.current();
        var bounds = bounds(page, size);
        var visible = catalog.getVisibleAssemblies(search, eventTag, mine, bounds.offset(), bounds.limit());
        // List clients already load the item catalog; do not duplicate every component projection.
        return visible.assemblies().stream().map(value -> mapper.assembly(value,
                visible.components().getOrDefault(value.id, List.of()), Map.of())).toList();
    }

    @Transactional
    public ApiResponses.AssemblyResponse assembly(UUID id) {
        actors.current();
        return projectAssembly(org.ash.inventory.operations.internal.persistence.EntityOrm.found(catalog.find(Assembly.class, id), "Assembly"));
    }

    @Transactional
    public ApiResponses.EventResponse event(UUID id) {
        actors.requireReader();
        return projectEvent(org.ash.inventory.operations.internal.persistence.EntityOrm.found(catalog.find(EventOccurrence.class, id), "Event occurrence"));
    }

    @Transactional
    public List<ApiResponses.EventResponse> events(String eventType, String status, int page, int size) {
        actors.requireReader();
        var bounds = bounds(page, size);
        return projectEvents(catalogOrm.events(eventType, status, bounds.offset(), bounds.limit(), false));
    }

    @Transactional
    public ApiResponses.OrderResponse previousFactionOrder(String eventType, String faction, java.time.LocalDate before, UUID excludeId) {
        actors.requireReader();
        if (eventType == null || eventType.isBlank() || faction == null || faction.isBlank() || before == null)
            throw ApiException.badRequest("Event type, faction and comparison date are required");
        var value = orders.previousFactionOrder(eventType, faction, before, excludeId);
        return value == null ? null : projectOrder(value);
    }

    @Transactional
    public List<ApiResponses.OrderSummaryResponse> orders(String eventType, String faction, String orderCode,
            List<DomainEnums.OrderStatus> statuses, UUID eventId, int page, int size) {
        // Every organization member reads all faction orders; writing is limited per faction.
        actors.requireReader();
        var bounds = bounds(page, size);
        var values = orders.orders(eventType, faction, orderCode, null, statuses, eventId, bounds.offset(), bounds.limit());

        var lines = orders.lines(values);
        var linesByOrder = new LinkedHashMap<UUID, List<org.ash.inventory.operations.internal.model.OrderLine>>();
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
        mapper.prepareLocations(values.stream().map(o -> o.pickupLocation).toList());
        return values.stream()
                .map(value -> mapper.orderSummary(value, linesByOrder.getOrDefault(value.id, List.of()), componentQuantities))
                .toList();
    }

    @Transactional
    public ApiResponses.OrderResponse order(UUID id) {
        var value = orders.findOrder(id);
        if (value == null || value.kind != org.ash.inventory.operations.internal.model.InventoryOrder.Kind.faction) throw ApiException.notFound("Faction order not found");
        orderService.assertCanView(value);
        return projectOrder(value);
    }

    @Transactional
    public List<ApiResponses.TransactionResponse> transactions(UUID itemId, UUID assetInstanceId, UUID userId, UUID eventOccurrenceId, String type,
            Instant start, Instant end, String search, int page, int size) {
        requireHistory(itemId != null || assetInstanceId != null, userId, DomainEnums.UserRole.warehouse_crew);
        if (start != null && end != null && !start.isBefore(end))
            throw ApiException.badRequest("Start date must precede the exclusive end date");
        var bounds = bounds(page, size);
        var values = operations.transactions(itemId, assetInstanceId, userId, eventOccurrenceId, type, start, end, search, bounds.offset(), bounds.limit());
        mapper.prepareLocations(values.stream().filter(t -> t.assetInstance != null).map(t -> t.assetInstance.currentLocation).toList());
        return mapper.transactions(values);
    }

    @Transactional
    public List<ApiResponses.DamageResponse> damageReports(UUID itemId, UUID assetInstanceId, UUID assemblyId,
            List<DomainEnums.DamageStatus> statuses, String search, int page, int size) {
        requireHistory(itemId != null || assetInstanceId != null || assemblyId != null, null, DomainEnums.UserRole.warehouse_crew);
        var bounds = bounds(page, size);
        return operations.damageReports(itemId, assetInstanceId, assemblyId, statuses, search, bounds.offset(), bounds.limit()).stream().map(mapper::damage).toList();
    }

    @Transactional
    public List<ApiResponses.MaintenanceResponse> maintenance(UUID itemId, int page, int size) {
        requireHistory(itemId != null, null, DomainEnums.UserRole.warehouse_crew);
        var bounds = bounds(page, size);
        return operations.maintenanceRecords(itemId, bounds.offset(), bounds.limit()).stream()
                .map(mapper::maintenance).toList();
    }

    /**
     * The organization-wide history is warehouse data. Histories of one item/asset are scoped by the
     * visibility predicate of the query; organization members may list their own transactions.
     */
    private void requireHistory(boolean resourceScoped, UUID userId, DomainEnums.UserRole minimum) {
        var actor = actors.current();
        if (resourceScoped) return;
        if (userId != null && userId.equals(actor.id) && ActorService.seesOrganization(actor)) return;
        actors.requireAtLeast(minimum, "History access required");
    }

    public List<ApiResponses.DeficitResponse> deficits(UUID eventOccurrenceId) {
        actors.requireAdmin();
        return planning.deficits(eventOccurrenceId);
    }

    @Transactional
    public List<ApiResponses.GeneralOrderSummaryResponse> generalOrders(org.ash.inventory.operations.internal.persistence.OrderOrm.Filter filter, int page, int size) {
        actors.requireReader();
        var actor = actors.current();
        var bounds = bounds(page, size);
        var values = orders.orders(actor, filter, bounds.offset(), bounds.limit());
        var names = generalOrderNames(values);
        return values.stream().map(o -> mapper.generalOrderSummary(o, namesFor(o, names))).toList();
    }

    @Transactional
    public ApiResponses.GeneralOrderResponse generalOrder(UUID id) {
        var order = orders.find(org.ash.inventory.operations.internal.model.InventoryOrder.class, id);
        if (order == null || order.kind != org.ash.inventory.operations.internal.model.InventoryOrder.Kind.general) throw ApiException.notFound("General order not found");
        actors.requireReader();
        return projectGeneralOrder(order);
    }

    public List<ApiResponses.ItemResponse> projectItems(List<Item> values) {
        mapper.prepareItems(values);
        var stock = inventory.stock(values);
        var images = catalogOrm.itemImages(values);
        var ordered = purchasing.outstandingQuantities(values.stream().map(i -> i.id).toList());
        return values.stream().map(i -> mapper.item(i, stock.get(i.id), images.getOrDefault(i.id, List.of()),
                ordered.getOrDefault(i.id, 0))).toList();
    }

    public ApiResponses.ItemResponse projectItem(Item value) {
        return projectItems(List.of(value)).getFirst();
    }

    public List<ApiResponses.AssemblyResponse> projectAssemblies(List<Assembly> values,
            Map<UUID, List<org.ash.inventory.operations.internal.model.AssemblyItem>> components) {
        accessPolicies.prepare(values.stream().map(a -> a.accessPolicy).toList());
        var items = components.values().stream().flatMap(List::stream).map(c -> c.item).distinct().toList();
        mapper.prepareItems(items);
        var images = catalogOrm.itemImages(items);
        var views = new LinkedHashMap<UUID, ApiResponses.ItemResponse>();
        for (var item : items) views.put(item.id, mapper.item(item, null, images.getOrDefault(item.id, List.of()), 0));
        return values.stream().map(a -> mapper.assembly(a, components.getOrDefault(a.id, List.of()), views)).toList();
    }

    public ApiResponses.AssemblyResponse projectAssembly(Assembly value) {
        return projectAssemblies(List.of(value), Map.of(value.id, catalog.getVisibleAssemblyComponents(value))).getFirst();
    }

    public List<ApiResponses.EventResponse> projectEvents(List<EventOccurrence> values) {
        var metrics = eventMetrics.summarize(values);
        return values.stream().map(e -> mapper.event(e, metrics.get(e.id))).toList();
    }

    public ApiResponses.EventResponse projectEvent(EventOccurrence value) {
        return projectEvents(List.of(value)).getFirst();
    }

    private Map<String, String> generalOrderNames(List<org.ash.inventory.operations.internal.model.InventoryOrder> values) {
        return catalogOrm.itemNames(values.stream().flatMap(o -> o.lines.stream()).map(line -> line.item.id).distinct().toList());
    }

    private Map<String, String> namesFor(org.ash.inventory.operations.internal.model.InventoryOrder order, Map<String, String> names) {
        var result = new LinkedHashMap<String, String>();
        order.lines.forEach(line -> { var id = line.item.id.toString(); if (names.containsKey(id)) result.put(id, names.get(id)); });
        return result;
    }

    public ApiResponses.GeneralOrderResponse projectGeneralOrder(org.ash.inventory.operations.internal.model.InventoryOrder value) {
        return mapper.generalOrder(value, generalOrderNames(List.of(value)), orders.history(value));
    }

    public ApiResponses.OrderDetail projectAnyOrder(org.ash.inventory.operations.internal.model.InventoryOrder value) {
        return value.kind == org.ash.inventory.operations.internal.model.InventoryOrder.Kind.general ? projectGeneralOrder(value) : projectOrder(value);
    }

    @Transactional
    public ApiResponses.OrderDetail orderDetail(UUID id) {
        actors.requireReader();
        var value = orders.find(org.ash.inventory.operations.internal.model.InventoryOrder.class, id);
        if (value == null) throw ApiException.notFound("Order not found");
        return projectAnyOrder(value);
    }

    public ApiResponses.OrderResponse projectOrder(org.ash.inventory.operations.internal.model.InventoryOrder value) {
        var actor = actors.current();
        var lines = orders.lines(List.of(value));
        var assemblies = lines.stream().filter(l -> l.sourceAssembly != null).map(l -> l.sourceAssembly).distinct().toList();
        var components = catalogOrm.assemblyItems(assemblies);
        var quantities = new LinkedHashMap<AssemblyItemId, Integer>();
        components.values().stream().flatMap(List::stream).forEach(c -> quantities.put(c.id, c.quantity));
        accessPolicies.prepare(assemblies.stream().map(a -> a.accessPolicy).toList());
        var visibleAssemblies = assemblies.stream().filter(a -> catalog.canViewAssembly(a, components.getOrDefault(a.id, List.of()), actor)).toList();
        var visibleComponents = new LinkedHashMap<UUID, List<org.ash.inventory.operations.internal.model.AssemblyItem>>();
        visibleAssemblies.forEach(a -> visibleComponents.put(a.id, components.getOrDefault(a.id, List.of())));
        var items = lines.stream().map(l -> l.item).distinct().filter(i -> catalog.canViewItem(i, actor)).toList();
        var assignments = new LinkedHashMap<String, List<ApiResponses.AssetInstanceResponse>>();
        var assigned = orders.assetAssignments(value).stream().map(a -> a.assetInstance).toList();
        var mappedAssets = mapper.assets(assigned);
        for (int i = 0; i < assigned.size(); i++)
            assignments.computeIfAbsent(assigned.get(i).item.id.toString(), ignored -> new ArrayList<>()).add(mappedAssets.get(i));
        var sources = new LinkedHashMap<String, String>();
        orders.reservations(value).stream().filter(r -> r.location != null).forEach(r -> sources.putIfAbsent(r.item.id.toString(), r.location.id.toString()));
        return mapper.order(value, lines, quantities, projectItems(items), projectAssemblies(visibleAssemblies, visibleComponents),
                orders.history(value).stream().map(mapper::history).toList(), assignments, sources);
    }

    @Transactional
    public List<ApiResponses.NotificationResponse> notifications(boolean unreadOnly, int page, int size) {
        var actor = actors.current();
        var bounds = bounds(page, size);
        return notifications.forRecipient(actor.id, unreadOnly, bounds.offset(), bounds.limit()).stream()
                .map(mapper::notification).toList();
    }

    @Transactional
    public int markAllNotificationsRead(Instant before) {
        var now = Instant.now();
        return notifications.markAllRead(actors.current().id, before == null || before.isAfter(now) ? now : before, now);
    }

    public long unreadNotificationCount() {
        return notifications.unreadCount(actors.current().id);
    }

    @Transactional
    @org.ash.inventory.operations.internal.security.PrivateInventoryCommand
    public ApiResponses.NotificationResponse markNotificationRead(UUID id) {
        var actor = actors.current();
        return mapper.notification(notifications.markRead(actor.id, id));
    }

    @Transactional
    public List<ApiResponses.UserResponse> users(String search, String role, int page, int size) {
        actors.requireAdmin();
        var bounds = bounds(page, size);
        DomainEnums.UserRole filter = null;
        if (role != null && !role.isBlank()) {
            try { filter = DomainEnums.UserRole.valueOf(role); }
            catch (IllegalArgumentException exception) { throw ApiException.badRequest("Unknown user role"); }
        }
        return users.directory(search, filter, bounds.offset(), bounds.limit()).stream().map(mapper::user).toList();
    }

    @Transactional
    public List<ApiResponses.UserAccessHistoryResponse> userAccessHistory(UUID id, int page, int size) {
        actors.requireAdmin();
        var bounds = bounds(page, size);
        if (users.find(id) == null) throw ApiException.notFound("User not found");
        var events = outbox.userAccessHistory(id, bounds.offset(), bounds.limit());
        var actorsById = users.byIds(events.stream().map(event -> event.actorId()).filter(java.util.Objects::nonNull).distinct().toList());
        return events.stream().map(event -> {
            var changedBy = event.actorId() == null ? null : actorsById.get(event.actorId());
            return new ApiResponses.UserAccessHistoryResponse(event.id(), event.occurredAt(),
                    changedBy == null ? null : mapper.actor(changedBy),
                    json.convertValue(event.payload().get("before"), ApiResponses.UserAccessState.class),
                    json.convertValue(event.payload().get("after"), ApiResponses.UserAccessState.class),
                    (String) event.payload().get("reason"));
        }).toList();
    }

    /** Pickers only need who can be assigned; contact details and access assignments stay in account administration. */
    @Transactional
    public List<ApiResponses.ActorSummary> assignableUsers(String search, String minimumRole, int page, int size) {
        actors.requireWarehouse();
        var bounds = bounds(page, size);
        DomainEnums.UserRole minimum = DomainEnums.UserRole.tenant;
        if (minimumRole != null && !minimumRole.isBlank()) {
            minimum = ActorService.parseRole(minimumRole);
            if (minimum == null) throw ApiException.badRequest("Unknown user role");
        }
        return users.assignable(search, minimum, bounds.offset(), bounds.limit()).stream().map(mapper::actor).toList();
    }

    private static org.ash.inventory.platform.api.PageBounds bounds(int page, int size) {
        return org.ash.inventory.platform.api.PageBounds.of(page, size);
    }
}
