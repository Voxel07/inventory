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

    public Summary summarize(EventOccurrence value) { return summarize(List.of(value)).get(value.id); }

    public Map<UUID, Summary> summarize(List<EventOccurrence> events) {
        if (events.isEmpty()) return Map.of();
        var ids = events.stream().map(e -> e.id).toList();
        var faction = orm.factionLines(ids).stream().collect(java.util.stream.Collectors.groupingBy(l -> l.order.eventOccurrence.id));
        var general = orm.generalOrders(ids).stream().collect(java.util.stream.Collectors.groupingBy(o -> o.eventOccurrence.id));
        var movements = orm.directMovements(ids).stream().collect(java.util.stream.Collectors.groupingBy(t -> t.eventOccurrence.id));
        var summaries = new LinkedHashMap<UUID, Summary>();
        for (var event : events) summaries.put(event.id, summarize(event, faction.getOrDefault(event.id, List.of()),
                general.getOrDefault(event.id, List.of()), movements.getOrDefault(event.id, List.of())));
        var itemIds = new HashSet<UUID>();
        summaries.values().forEach(summary -> summary.itemIds().forEach(id -> {
            try { itemIds.add(UUID.fromString(id)); } catch (IllegalArgumentException ignored) { }
        }));
        var names = new HashMap<String, String>();
        orm.items(itemIds).forEach(item -> names.put(item.id.toString(), item.name));
        summaries.values().forEach(summary -> summary.itemIds().forEach(id -> {
            if (names.containsKey(id)) summary.itemNames().put(id, names.get(id));
        }));
        return summaries;
    }

    private Summary summarize(EventOccurrence value, List<FactionOrderLine> factionLines,
            List<GeneralOrder> generalOrders, List<StockTransaction> direct) {
        var planned = value.plannedQuantities == null ? Map.<String, Integer>of() : value.plannedQuantities;
        var used = new LinkedHashMap<String, Integer>();
        var quantities = new LinkedHashMap<String, Map<String, Integer>>();
        for (var metric : List.of("requested", "prepared", "handedOver", "returned", "consumed", "damaged", "missing", "writtenOff", "outstanding"))
            quantities.put(metric, new LinkedHashMap<>());
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
        return new Summary(itemIds.stream().sorted().toList(), planned, used, itemNames, quantities);
    }
}
