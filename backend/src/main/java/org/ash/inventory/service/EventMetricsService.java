package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.ash.inventory.model.*;
import org.ash.inventory.orm.EventMetricsOrm;
import java.util.*;

/** Historical event quantities are domain projections, independent of HTTP mapping. */
@ApplicationScoped
public class EventMetricsService {
    @Inject EventMetricsOrm orm;
    public record Summary(List<String> itemIds, Map<String, Integer> planned, Map<String, Integer> used,
            Map<String, String> itemNames, Map<String, Map<String, Integer>> quantities) {}

    public Summary summarize(EventOccurrence value) {
        var planned = value.plannedQuantities == null ? Map.<String, Integer>of() : value.plannedQuantities;
        var used = new LinkedHashMap<String, Integer>();
        var quantities = new LinkedHashMap<String, Map<String, Integer>>();
        for (var metric : List.of("requested", "prepared", "handedOver", "returned", "consumed", "damaged", "missing", "writtenOff", "outstanding"))
            quantities.put(metric, new LinkedHashMap<>());
        var factionLines = orm.factionLines(value);
        for (var line : factionLines) {
            String id = line.item.id.toString();
            quantities.get("requested").merge(id, line.requestedQuantity, Integer::sum);
            quantities.get("prepared").merge(id, line.preparedQuantity, Integer::sum);
            quantities.get("handedOver").merge(id, line.handedOverQuantity, Integer::sum);
            quantities.get("returned").merge(id, line.returnedQuantity, Integer::sum);
            quantities.get("consumed").merge(id, line.consumedQuantity, Integer::sum);
            quantities.get("damaged").merge(id, line.damagedQuantity, Integer::sum);
            quantities.get("missing").merge(id, line.missingQuantity, Integer::sum);
            quantities.get("writtenOff").merge(id, line.writtenOffQuantity, Integer::sum);
        }
        var generalOrders = orm.generalOrders(value);
        for (var order : generalOrders) {
            order.requestedQuantities.forEach((id, qty) -> quantities.get("requested").merge(id, qty, Integer::sum));
            order.handedOverQuantities.forEach((id, qty) -> quantities.get("handedOver").merge(id, qty, Integer::sum));
            order.returnedQuantities.forEach((id, qty) -> quantities.get("returned").merge(id, qty, Integer::sum));
            order.consumedQuantities.forEach((id, qty) -> quantities.get("consumed").merge(id, qty, Integer::sum));
            order.preparedQuantities.forEach((id, qty) -> quantities.get("prepared").merge(id, qty, Integer::sum));
            order.damagedQuantities.forEach((id, qty) -> quantities.get("damaged").merge(id, qty, Integer::sum));
            order.missingQuantities.forEach((id, qty) -> quantities.get("missing").merge(id, qty, Integer::sum));
            order.writtenOffQuantities.forEach((id, qty) -> quantities.get("writtenOff").merge(id, qty, Integer::sum));
        }
        var direct = orm.directMovements(value);
        for (var tx : direct) {
            String metric = switch (tx.type) { case checkout -> "handedOver"; case checkin -> "returned"; case consumed -> "consumed"; case written_off -> tx.custodyWriteOff ? "writtenOff" : null; default -> null; };
            if (metric != null) quantities.get(metric).merge(tx.item.id.toString(), tx.quantity, Integer::sum);
        }
        used.putAll(quantities.get("handedOver"));
        used.forEach((id, handedOver) -> quantities.get("outstanding").put(id, Math.max(0, handedOver
                - quantities.get("returned").getOrDefault(id, 0) - quantities.get("consumed").getOrDefault(id, 0)
                - quantities.get("damaged").getOrDefault(id, 0) - quantities.get("writtenOff").getOrDefault(id, 0))));
        var itemNames = new LinkedHashMap<String, String>();
        var itemIds = new java.util.HashSet<String>();
        itemIds.addAll(planned.keySet());
        itemIds.addAll(used.keySet());
        itemIds.addAll(quantities.get("requested").keySet());
        for (var itemId : itemIds) {
            try {
                var item = orm.find(Item.class, UUID.fromString(itemId));
                if (item != null) itemNames.put(itemId, item.name);
            } catch (IllegalArgumentException ignored) { }
        }
        return new Summary(itemIds.stream().sorted().toList(), planned, used, itemNames, quantities);
    }
}
