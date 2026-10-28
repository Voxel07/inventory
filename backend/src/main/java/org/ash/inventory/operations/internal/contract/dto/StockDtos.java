package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.operations.internal.model.DomainEnums;

import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class StockDtos {
    private StockDtos() {}

    /**
     * A lot exists only with stock: it is created by the stock booking (added/adjusted transaction or goods receipt)
     * that brings its first units in, for that booking's item. Also the shape of a lot update; the item never changes.
     */
    public record LotInput(@NotBlank String lotNumber, LocalDate expiryDate, DomainEnums.LotStatus status) {}
    /**
     * {@code stock}: one row per location holding the lot. {@code empty}: nothing on hand or in transit, which is
     * computed and independent of the eligibility {@code status}.
     */
    public record LotResponse(UUID id, UUID itemId, String itemName, String itemSku, boolean itemActive,
            String lotNumber, LocalDate expiryDate, String status, Instant createdAt, Instant updatedAt,
            List<LotStock> stock, boolean empty) {}
    /** Lot quantities at one location; {@code available} excludes damage, quarantine and its FEFO share of reservations. */
    public record LotStock(UUID locationId, String locationName, int onHand, int available, int reserved, int damaged,
            int quarantined, int inTransit) {}

    public record PositionResponse(UUID id, UUID itemId, String itemName, UUID locationId, UUID lotId,
            int quantityOnHand, int quantityReserved, int quantityDamaged, int quantityQuarantined,
            int quantityInTransit, int availableQuantity, int transferableQuantity, Instant lastCountedAt, long version) {}
}
