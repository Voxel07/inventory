package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.operations.internal.model.DomainEnums;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class StockDtos {
    private StockDtos() {}

    /** A lot belongs to its item for life: the item is chosen once, at creation. */
    public record LotCreateInput(@NotNull UUID itemId, @NotBlank String lotNumber, String supplierLot,
            LocalDate manufactureDate, LocalDate expiryDate, LocalDate bestBeforeDate,
            String storageRequirements, DomainEnums.LotStatus status, String notes) {
        public LotUpdateInput metadata() {
            return new LotUpdateInput(lotNumber, supplierLot, manufactureDate, expiryDate, bestBeforeDate, storageRequirements, status, notes, itemId);
        }
    }
    /**
     * Batch metadata only. The parent item cannot change: {@code itemId} exists solely so that a request naming
     * another item is rejected instead of silently ignored.
     */
    public record LotUpdateInput(@NotBlank String lotNumber, String supplierLot,
            LocalDate manufactureDate, LocalDate expiryDate, LocalDate bestBeforeDate,
            String storageRequirements, DomainEnums.LotStatus status, String notes, UUID itemId) {}
    /**
     * {@code stock}: one row per location holding the lot. {@code empty}: nothing on hand or in transit, which is
     * computed and independent of the eligibility {@code status}.
     */
    public record LotResponse(UUID id, UUID itemId, String itemName, String itemSku, boolean itemActive,
            String lotNumber, String supplierLot,
            LocalDate manufactureDate, LocalDate expiryDate, LocalDate bestBeforeDate,
            String storageRequirements, String status, String notes, Instant createdAt, Instant updatedAt,
            List<LotStock> stock, boolean empty) {}
    /** Lot quantities at one location; {@code available} excludes damage, quarantine and its FEFO share of reservations. */
    public record LotStock(UUID locationId, String locationName, int onHand, int available, int reserved, int damaged,
            int quarantined, int inTransit) {}

    public record PositionResponse(UUID id, UUID itemId, String itemName, UUID locationId, UUID lotId,
            int quantityOnHand, int quantityReserved, int quantityDamaged, int quantityQuarantined,
            int quantityInTransit, int availableQuantity, int transferableQuantity, Instant lastCountedAt, long version) {}
}
