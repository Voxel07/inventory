package org.ash.inventory.resource.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CustodyDtos {
    private CustodyDtos() {}

    public record HandoverLineResponse(UUID id, UUID orderLineId, UUID itemId, String itemName,
            UUID assetInstanceId, String assetCode, int quantity, String conditionNotes) {}

    public record HandoverResponse(UUID id, UUID orderId, String handoverCode, String type,
            UUID marshalId, UUID collectorId, String collectorName, UUID locationId,
            Instant occurredAt, boolean conditionConfirmed, String acknowledgementObjectKey,
            String notes, List<HandoverLineResponse> lines) {}

    public record ReconciliationResponse(UUID id, UUID orderId, UUID orderLineId, UUID itemId,
            String itemName, UUID assetInstanceId, String assetCode, String outcome, int quantity,
            String conditionBefore, String conditionAfter, UUID recordedById, UUID idempotencyKey,
            String notes, Instant createdAt) {}
}
