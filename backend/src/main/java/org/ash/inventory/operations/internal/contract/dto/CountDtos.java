package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.platform.api.InputText;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CountDtos {
    private CountDtos() {}

    public record CountInput(@InputText String sessionNumber, UUID locationId, @InputText String category,
            UUID itemId, boolean blindCount, @InputText String notes) {}
    public record CountLineInput(@NotNull UUID lineId, @Min(0) int quantity, @InputText String notes) {}
    public record CountSubmissionInput(@NotEmpty @jakarta.validation.constraints.Size(max = 2000) List<@NotNull @Valid CountLineInput> lines, @InputText String notes) {}
    public record CountCommandInput(@InputText String notes) {}
    public record CountLineResponse(UUID id, UUID itemId, String itemName, UUID assetInstanceId,
            String assetCode, UUID lotId, UUID locationId, Integer expectedQuantity,
            Integer countedQuantity, Integer recountedQuantity, Integer approvedQuantity,
            Integer varianceQuantity, UUID countedById, String notes) {}
    public record CountResponse(UUID id, String sessionNumber, UUID locationId,
            String category, UUID itemId, boolean blindCount, String status, UUID createdById,
            UUID approvedById, Instant startedAt, Instant completedAt, Instant approvedAt,
            String notes, List<CountLineResponse> lines) {}
}
