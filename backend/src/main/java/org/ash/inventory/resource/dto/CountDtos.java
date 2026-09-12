package org.ash.inventory.resource.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CountDtos {
    private CountDtos() {}

    public record CountInput(String sessionNumber, UUID warehouseId, UUID locationId, String category,
            UUID itemId, boolean blindCount, String notes) {}
    public record CountLineInput(@NotNull UUID lineId, @Min(0) int quantity, String notes) {}
    public record CountSubmissionInput(@NotEmpty List<@Valid CountLineInput> lines, String notes) {}
    public record CountCommandInput(String notes) {}
    public record CountLineResponse(UUID id, UUID itemId, String itemName, UUID assetInstanceId,
            String assetCode, UUID lotId, UUID locationId, Integer expectedQuantity,
            Integer countedQuantity, Integer recountedQuantity, Integer approvedQuantity,
            Integer varianceQuantity, UUID countedById, String notes) {}
    public record CountResponse(UUID id, String sessionNumber, UUID warehouseId, UUID locationId,
            String category, UUID itemId, boolean blindCount, String status, UUID createdById,
            UUID approvedById, Instant startedAt, Instant completedAt, Instant approvedAt,
            String notes, List<CountLineResponse> lines) {}
}
