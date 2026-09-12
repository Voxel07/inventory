package org.ash.inventory.service;

import org.ash.inventory.model.AssemblyItemId;
import org.ash.inventory.model.FactionOrderLine;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** One authoritative projection of order-line quantities for commands and API responses. */
public record OrderQuantities(
        Map<String, Integer> requested,
        Map<String, Integer> prepared,
        Map<String, Integer> allocated,
        Map<String, Integer> reserved,
        Map<String, Integer> handedOver,
        Map<String, Integer> returned,
        Map<String, Integer> consumed,
        Map<String, Integer> missing,
        Map<String, Integer> damaged,
        Map<String, Integer> writtenOff,
        Map<String, Integer> requestedAssemblies,
        Map<String, Integer> preparedAssemblies) {

    public static OrderQuantities from(List<FactionOrderLine> lines, Map<AssemblyItemId, Integer> componentQuantities) {
        var requested = new LinkedHashMap<String, Integer>();
        var prepared = new LinkedHashMap<String, Integer>();
        var allocated = new LinkedHashMap<String, Integer>();
        var reserved = new LinkedHashMap<String, Integer>();
        var handedOver = new LinkedHashMap<String, Integer>();
        var returned = new LinkedHashMap<String, Integer>();
        var consumed = new LinkedHashMap<String, Integer>();
        var missing = new LinkedHashMap<String, Integer>();
        var damaged = new LinkedHashMap<String, Integer>();
        var writtenOff = new LinkedHashMap<String, Integer>();
        var assemblyLines = new LinkedHashMap<UUID, List<FactionOrderLine>>();
        for (var line : lines) {
            String itemId = line.item.id.toString();
            if (line.sourceAssembly == null) {
                requested.merge(itemId, line.requestedQuantity, Integer::sum);
                prepared.merge(itemId, line.preparedQuantity, Integer::sum);
            } else {
                assemblyLines.computeIfAbsent(line.sourceAssembly.id, ignored -> new ArrayList<>()).add(line);
            }
            allocated.merge(itemId, line.allocatedQuantity, Integer::sum);
            reserved.merge(itemId, line.reservedQuantity, Integer::sum);
            handedOver.merge(itemId, line.handedOverQuantity, Integer::sum);
            returned.merge(itemId, line.returnedQuantity, Integer::sum);
            consumed.merge(itemId, line.consumedQuantity, Integer::sum);
            missing.merge(itemId, line.missingQuantity, Integer::sum);
            damaged.merge(itemId, line.damagedQuantity, Integer::sum);
            writtenOff.merge(itemId, line.writtenOffQuantity, Integer::sum);
        }
        var requestedAssemblies = new LinkedHashMap<String, Integer>();
        var preparedAssemblies = new LinkedHashMap<String, Integer>();
        for (var entry : assemblyLines.entrySet()) {
            int requestedCount = minimumAssemblyCount(entry.getKey(), entry.getValue(), componentQuantities, false);
            int preparedCount = minimumAssemblyCount(entry.getKey(), entry.getValue(), componentQuantities, true);
            requestedAssemblies.put(entry.getKey().toString(), requestedCount);
            preparedAssemblies.put(entry.getKey().toString(), preparedCount);
        }
        return new OrderQuantities(requested, prepared, allocated, reserved, handedOver, returned, consumed,
                missing, damaged, writtenOff, requestedAssemblies, preparedAssemblies);
    }

    private static int minimumAssemblyCount(UUID assemblyId, List<FactionOrderLine> lines,
            Map<AssemblyItemId, Integer> componentQuantities, boolean prepared) {
        return lines.stream().mapToInt(line -> {
            int component = componentQuantities.getOrDefault(new AssemblyItemId(assemblyId, line.item.id), 1);
            return (prepared ? line.preparedQuantity : line.requestedQuantity) / component;
        }).min().orElse(0);
    }
}
