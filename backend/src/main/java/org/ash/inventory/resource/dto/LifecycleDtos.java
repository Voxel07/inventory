package org.ash.inventory.resource.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.ash.inventory.model.DomainEnums;

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
    public record ScheduleResponse(UUID id, UUID itemId, UUID assetInstanceId, String maintenanceType,
            String intervalType, BigDecimal intervalValue, Instant nextDueAt, BigDecimal nextDueValue,
            BigDecimal warningWindow, UUID responsiblePersonId, String requiredChecklist,
            boolean checkoutBlocking, boolean active) {}

    public record RepairInput(@NotNull UUID damageReportId, UUID repairOwnerId, UUID vendorId,
            String partsAndCostNotes, String notes) {}
    public record RepairTransitionInput(@NotNull DomainEnums.RepairStatus status, @Min(1) Integer amount,
            UUID repairOwnerId, UUID vendorId, String verificationResult, String notes, UUID idempotencyKey) {}
    public record RepairResponse(UUID id, UUID damageReportId, UUID assetInstanceId, UUID handoverId,
            String status, UUID repairOwnerId, UUID vendorId, boolean safetyImpact,
            String partsAndCostNotes, Instant startedAt, Instant completedAt,
            String verificationResult, UUID approvedById, String notes, Instant createdAt, Instant updatedAt) {}
}
