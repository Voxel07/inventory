package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.operations.internal.model.DomainEnums;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class LifecycleDtos {
    private LifecycleDtos() {}

    public record ScheduleInput(@NotNull UUID itemId, UUID assetInstanceId,
            @NotNull DomainEnums.MaintenanceType maintenanceType,
            @NotNull DomainEnums.MaintenanceIntervalType intervalType,
            @NotNull @DecimalMin("0.01") BigDecimal intervalValue,
            Instant nextDueAt, BigDecimal nextDueValue, BigDecimal warningWindow,
            UUID responsiblePersonId, String requiredChecklist, boolean checkoutBlocking, Boolean active) {}
    public record ScheduleResponse(UUID id, UUID itemId, String itemName, String itemSku, UUID assetInstanceId, String assetCode, String maintenanceType,
            String intervalType, BigDecimal intervalValue, Instant nextDueAt, BigDecimal nextDueValue,
            BigDecimal warningWindow, UUID responsiblePersonId, String requiredChecklist,
            boolean checkoutBlocking, boolean active) {}

    public record RepairInput(@NotNull UUID damageReportId, UUID repairOwnerId, UUID vendorId,
            String partsAndCostNotes, String notes, @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}
    public record RepairTransitionInput(@NotNull DomainEnums.RepairStatus status, @Min(1) Integer amount,
            UUID repairOwnerId, UUID vendorId, String verificationResult, String notes, UUID idempotencyKey,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}
    /** Carries the damaged item/assembly identity so lists need no catalog or damage-report lookups. */
    public record RepairResponse(UUID id, UUID damageReportId, UUID itemId, String itemName, String assemblyName, String assetCode,
            String damageDescription, UUID assetInstanceId, UUID handoverId,
            String status, UUID repairOwnerId, UUID vendorId, boolean safetyImpact,
            String partsAndCostNotes, Instant startedAt, Instant completedAt,
            String verificationResult, UUID approvedById, String notes, Instant createdAt, Instant updatedAt) {}
}
