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
            UUID factionOrderId, UUID generalOrderId, UUID assetInstanceId, UUID eventOccurrenceId) {}
    private final CustodyOrm orm;
    private final ActorService actors;
    public CustodyBalanceService(CustodyOrm orm, ActorService actors) { this.orm = orm; this.actors = actors; }

    public boolean hasOutstandingAsset(UUID assetId) { return orm.hasOutstandingAsset(assetId); }

    @Transactional
    public List<Balance> list(boolean mine) {
        var actor = actors.current();
        boolean all = !mine && List.of(DomainEnums.UserRole.hq_admin, DomainEnums.UserRole.warehouse_crew,
                DomainEnums.UserRole.marshal).contains(actor.role);
        var rows = new LinkedHashMap<String, Balance>();
        for (var line : orm.factionLines()) {
            var order = line.order;
            if (!all && !order.createdBy.id.equals(actor.id)) continue;
            int outstanding = CustodyQuantities.outstanding(line);
            if (outstanding > 0) {
                var row = balance(line.item, order.createdBy, order.eventOccurrence, order.id, null, null, outstanding,
                        order.collectorName == null ? order.faction.name : order.collectorName);
                var prior = rows.get(row.key());
                rows.put(row.key(), copy(row, outstanding + (prior == null ? 0 : prior.checkedOut()), 0));
            }
        }
        for (var order : orm.generalOrders()) {
            if (!all && !order.createdBy.id.equals(actor.id)) continue;
            for (var entry : order.handedOverQuantities.entrySet()) {
                var id = entry.getKey(); var item = orm.item(id);
                int outstanding = CustodyQuantities.outstanding(order, id);
                if (outstanding <= 0) continue;
                if (item.trackingMode == DomainEnums.TrackingMode.serialized) {
                    for (var asset : order.assetAssignments.getOrDefault(id, List.of())) {
                        if (order.reconciledAssets.getOrDefault(id, List.of()).contains(asset)) continue;
                        var row = balance(item, order.createdBy, order.eventOccurrence, null, order.id, UUID.fromString(asset), 1, null);
                        rows.put(row.key(), row);
                    }
                } else {
                    var row = balance(item, order.createdBy, order.eventOccurrence, null, order.id, null, outstanding, null);
                    rows.put(row.key(), row);
                }
            }
        }
        for (var tx : orm.directTransactions()) {
            if (!all && !tx.user.id.equals(actor.id)) continue;
            int change = switch (tx.type) {
                case checkout -> tx.quantity;
                case checkin, consumed -> -tx.quantity;
                case written_off -> tx.custodyWriteOff ? -tx.quantity : 0;
                default -> 0;
            };
            if (change == 0) continue;
            var row = balance(tx.item, tx.user, tx.eventOccurrence, null, null,
                    tx.assetInstance == null ? null : tx.assetInstance.id, change, null);
            var prior = rows.get(row.key());
            rows.put(row.key(), copy(row, change + (prior == null ? 0 : prior.checkedOut()), 0));
        }
        for (var pending : orm.pending()) {
            var key = key(pending.item.id, pending.returnedFor.id, pending.eventOccurrence == null ? null : pending.eventOccurrence.id,
                    pending.factionOrder == null ? null : pending.factionOrder.id, pending.generalOrder == null ? null : pending.generalOrder.id,
                    pending.factionOrder != null || pending.assetInstance == null ? null : pending.assetInstance.id);
            var row = rows.get(key);
            if (row != null) rows.put(key, copy(row, row.checkedOut(), row.pendingQuantity() + pending.quantity));
        }
        return rows.values().stream().filter(row -> row.checkedOut() > 0)
                .sorted(Comparator.comparing(Balance::name).thenComparing(Balance::key)).toList();
    }
    private Balance balance(Item item, UserAccount user, EventOccurrence event, UUID faction, UUID general, UUID asset, int amount, String person) {
        var location = item.returnLocation == null ? item.storageLocation : item.returnLocation;
        UUID eventId = event == null ? null : event.id;
        return new Balance(key(item.id, user.id, eventId, faction, general, asset), item.id, item.name, item.category,
                location == null ? "" : location.name, amount, 0, user.id, person == null ? user.name : person,
                eventId == null ? "" : eventId.toString(), event == null ? "" : event.name,
                faction, general, asset, eventId);
    }
    private String key(UUID item, UUID user, UUID event, UUID faction, UUID general, UUID asset) {
        return item + ":" + user + ":" + event + ":" + faction + ":" + general + ":" + asset;
    }
    private Balance copy(Balance r, int quantity, int pending) {
        return new Balance(r.key(), r.itemId(), r.name(), r.category(), r.storageLocation(), quantity, pending,
                r.personId(), r.person(), r.eventKey(), r.event(), r.factionOrderId(), r.generalOrderId(), r.assetInstanceId(), r.eventOccurrenceId());
    }
}
