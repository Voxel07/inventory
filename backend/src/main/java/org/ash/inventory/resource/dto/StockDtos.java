package org.ash.inventory.resource.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.ash.inventory.model.DomainEnums;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class StockDtos {
    private StockDtos() {}

    public record WarehouseInput(@NotBlank String code, @NotBlank String name, String description, Boolean active) {}
    public record WarehouseResponse(UUID id, Instant createdAt, Instant updatedAt, String code, String name,
            String description, boolean active) {}

    public record InventoryCodeInput(@NotBlank String code, @NotNull DomainEnums.CodeTargetType targetType,
            @NotNull UUID targetId, boolean primaryCode) {}
    public record InventoryCodeResponse(UUID id, String code, String targetType, UUID targetId,
            boolean primaryCode, boolean active, Instant retiredAt) {}
    public record CodeResolutionResponse(String code, String targetType, UUID targetId) {}

    public record LotInput(@NotNull UUID itemId, @NotBlank String lotNumber, String supplierLot,
            LocalDate manufactureDate, LocalDate expiryDate, LocalDate bestBeforeDate,
            String storageRequirements, DomainEnums.LotStatus status, String notes) {}
    public record LotResponse(UUID id, UUID itemId, String lotNumber, String supplierLot,
            LocalDate manufactureDate, LocalDate expiryDate, LocalDate bestBeforeDate,
            String storageRequirements, String status, String notes, Instant createdAt, Instant updatedAt) {}

    public record PositionResponse(UUID id, UUID itemId, UUID locationId, UUID lotId,
            int quantityOnHand, int quantityReserved, int quantityDamaged, int quantityQuarantined,
            int quantityInTransit, int availableQuantity, Instant lastCountedAt, long version) {}
}
