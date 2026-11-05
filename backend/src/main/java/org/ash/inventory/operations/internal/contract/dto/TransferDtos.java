package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.platform.api.InputText;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class TransferDtos {
    private TransferDtos() {}

    public record TransferLineInput(@NotNull UUID itemId, UUID assetInstanceId, UUID lotId,
            @Min(1) int quantity) {}
    public record TransferInput(@InputText String transferNumber, @NotNull UUID sourceLocationId,
            @NotNull UUID destinationLocationId, @NotNull UUID idempotencyKey, @InputText String notes,
            @NotEmpty @jakarta.validation.constraints.Size(max = 2000) List<@NotNull @Valid TransferLineInput> lines) {}
    public record ReceiveLineInput(@NotNull UUID transferLineId, @Min(0) int receivedQuantity,
            @Min(0) int discrepancyQuantity, @InputText String discrepancyNotes) {}
    public record ReceiveInput(@NotNull UUID idempotencyKey,
            @NotEmpty @jakarta.validation.constraints.Size(max = 2000) List<@NotNull @Valid ReceiveLineInput> lines, @InputText String notes) {}
    public record CommandInput(@NotNull UUID idempotencyKey, @InputText String notes) {}

    public record TransferLineResponse(UUID id, UUID itemId, String itemName, UUID assetInstanceId,
            String assetCode, UUID lotId, int requestedQuantity, int pickedQuantity,
            int receivedQuantity, int discrepancyQuantity, String discrepancyNotes) {}
    public record TransferResponse(UUID id, String transferNumber, UUID sourceLocationId,
            UUID destinationLocationId, String status, UUID requestedById, UUID receivedById,
            Instant dispatchedAt, Instant receivedAt, UUID idempotencyKey, String notes,
            List<TransferLineResponse> lines) {}
}
