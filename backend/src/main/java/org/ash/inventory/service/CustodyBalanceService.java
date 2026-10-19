package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.CustodyOrm;
import java.util.*;

/** Outstanding custody is independent of warehouse availability. Missing remains outstanding. */
@ApplicationScoped
public class CustodyBalanceService {
    public record Balance(String key, UUID itemId, String name, String category, String storageLocation,
            int checkedOut, int pendingQuantity, UUID personId, String person, String eventKey, String event,
            UUID orderId, InventoryOrder.Kind orderKind, UUID assetInstanceId, UUID eventOccurrenceId) {
        boolean factionOrder() { return orderKind == InventoryOrder.Kind.faction; }
    }
    private final CustodyOrm orm;
    private final ActorService actors;
    public CustodyBalanceService(CustodyOrm orm, ActorService actors) { this.orm = orm; this.actors = actors; }

    @jakarta.inject.Inject InventoryAccessService accessViews;
    public boolean hasOutstandingAsset(UUID assetId) { return orm.hasOutstandingAsset(assetId); }

    @Transactional
    public List<Balance> list(boolean mine) {
        var actor = actors.current();
        // The warehouse oversees everyone's custody; others see their own.
        boolean all = !mine && actor.role.atLeast(DomainEnums.UserRole.warehouse_crew);
        UUID recipient = all ? null : actor.id;
        var rows = new LinkedHashMap<String, Balance>();
        var lines = orm.orderLines(recipient);
        var direct = orm.directBalances(recipient);
        var items = new ArrayList<Item>();
        lines.forEach(line -> items.add(line.item)); direct.forEach(tx -> items.add(tx.item()));
        var policies = new ArrayList<InventoryAccessPolicy>();
        for (var item : items) {
            var location = item.returnLocation == null ? item.storageLocation : item.returnLocation;
            if (location != null) policies.add(location.accessPolicy);
        }
        accessViews.prepare(policies);
        for (var line : lines) {
            var order = line.order;
            boolean faction = order.kind == InventoryOrder.Kind.faction;
            int outstanding = CustodyQuantities.outstanding(line);
            if (!faction && line.item.trackingMode == DomainEnums.TrackingMode.serialized) {
                for (var assignment : line.assets) {
                    if (assignment.reconciled) continue;
                    var row = balance(line.item, order.createdBy, order.eventOccurrence, order, assignment.assetInstance.id, 1, null);
                    rows.put(row.key(), row);
                }
            } else {
                var row = balance(line.item, order.createdBy, order.eventOccurrence, order,
                        null, outstanding, faction ? (order.collectorName == null ? order.factionLabel() : order.collectorName) : null);
                var prior = rows.get(row.key());
                rows.put(row.key(), copy(row, outstanding + (prior == null ? 0 : prior.checkedOut()), 0));
            }
        }
        for (var tx : direct) {
            var row = balance(tx.item(), tx.user(), tx.event(), null, tx.asset(), tx.quantity(), null);
            rows.put(row.key(), row);
        }
        for (var pending : orm.pending(recipient)) {
            // Faction-order custody is one row per item; asset-level rows exist for general orders and direct checkouts.
            var key = key((UUID) pending[0], (UUID) pending[1], (UUID) pending[2], (UUID) pending[3],
                    pending[4] == InventoryOrder.Kind.faction ? null : (UUID) pending[5]);
            var row = rows.get(key);
            if (row != null) rows.put(key, copy(row, row.checkedOut(), row.pendingQuantity() + Math.toIntExact(((Number) pending[6]).longValue())));
        }
        return rows.values().stream().filter(row -> row.checkedOut() > 0)
                .sorted(Comparator.comparing(Balance::name).thenComparing(Balance::key)).toList();
    }
    private Balance balance(Item item, UserAccount user, EventOccurrence event, InventoryOrder order, UUID asset, int amount, String person) {
        var location = item.returnLocation == null ? item.storageLocation : item.returnLocation;
        UUID eventId = event == null ? null : event.id;
        UUID orderId = order == null ? null : order.id;
        return new Balance(key(item.id, user.id, eventId, orderId, asset), item.id, item.name, item.category,
                location != null && accessViews.projectionAllows(location.accessPolicy) ? location.name : "", amount, 0, user.id, person == null ? user.name : person,
                eventId == null ? "" : eventId.toString(), event == null ? "" : event.name,
                orderId, order == null ? null : order.kind, asset, eventId);
    }
    private String key(UUID item, UUID user, UUID event, UUID order, UUID asset) {
        return item + ":" + user + ":" + event + ":" + order + ":" + asset;
    }
    private Balance copy(Balance r, int quantity, int pending) {
        return new Balance(r.key(), r.itemId(), r.name(), r.category(), r.storageLocation(), quantity, pending,
                r.personId(), r.person(), r.eventKey(), r.event(), r.orderId(), r.orderKind(), r.assetInstanceId(), r.eventOccurrenceId());
    }
}
