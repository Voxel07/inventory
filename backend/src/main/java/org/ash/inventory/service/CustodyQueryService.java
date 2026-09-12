package org.ash.inventory.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import org.ash.inventory.orm.CustodyOrm;
import org.ash.inventory.orm.OrderOrm;
import org.ash.inventory.resource.ApiException;
import org.ash.inventory.resource.dto.CustodyDtos;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class CustodyQueryService {
    private final CustodyOrm custody;
    private final OrderOrm orders;
    private final OrderService orderService;

    public CustodyQueryService(CustodyOrm custody, OrderOrm orders, OrderService orderService) {
        this.custody = custody;
        this.orders = orders;
        this.orderService = orderService;
    }

    @Transactional
    public List<CustodyDtos.HandoverResponse> handovers(UUID orderId, int page, int size) {
        authorize(orderId);
        var values = custody.handovers(orderId, offset(page, size), size);
        var linesByHandover = new LinkedHashMap<UUID, List<CustodyDtos.HandoverLineResponse>>();
        for (var line : custody.lines(values)) {
            linesByHandover.computeIfAbsent(line.handover.id, ignored -> new ArrayList<>()).add(
                    new CustodyDtos.HandoverLineResponse(line.id, line.orderLine.id, line.item.id,
                            line.item.name, line.assetInstance == null ? null : line.assetInstance.id,
                            line.assetInstance == null ? null : line.assetInstance.assetCode,
                            line.quantity, line.conditionNotes));
        }
        return values.stream().map(value -> new CustodyDtos.HandoverResponse(value.id, value.order.id,
                value.handoverCode, value.type.name(), value.marshal.id,
                value.collector == null ? null : value.collector.id, value.collectorName,
                value.location == null ? null : value.location.id, value.occurredAt,
                value.conditionConfirmed, value.acknowledgementObjectKey, value.notes,
                linesByHandover.getOrDefault(value.id, List.of()))).toList();
    }

    @Transactional
    public List<CustodyDtos.ReconciliationResponse> reconciliations(UUID orderId, int page, int size) {
        authorize(orderId);
        return custody.reconciliations(orderId, offset(page, size), size).stream().map(value ->
                new CustodyDtos.ReconciliationResponse(value.id, value.order.id, value.orderLine.id,
                        value.item.id, value.item.name,
                        value.assetInstance == null ? null : value.assetInstance.id,
                        value.assetInstance == null ? null : value.assetInstance.assetCode,
                        value.outcome.name(), value.quantity,
                        value.conditionBefore == null ? null : value.conditionBefore.name(),
                        value.conditionAfter == null ? null : value.conditionAfter.name(),
                        value.recordedBy.id, value.idempotencyKey, value.notes, value.createdAt)).toList();
    }

    private void authorize(UUID orderId) {
        var order = orders.findOrder(orderId);
        if (order == null) throw ApiException.notFound("Faction order not found");
        orderService.assertCanView(order);
    }

    private int offset(int page, int size) {
        if (page < 0 || size < 1 || size > 200) throw ApiException.badRequest("Invalid page bounds");
        try {
            return Math.multiplyExact(page, size);
        } catch (ArithmeticException exception) {
            throw ApiException.badRequest("Page offset is too large");
        }
    }
}
