package org.ash.inventory.resource;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.ash.inventory.model.DomainEnums;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class ApiModels {
    private ApiModels() {}

    public record ItemInput(
            String sku, @NotBlank String name, String description, @NotBlank String category, String subcategory, String supplier,
            List<String> eventTypes, boolean consumable, @Min(0) Integer amount, @Min(0) Integer minStock,
            @Min(0) BigDecimal value, UUID storageLocation, String positionDetails, String hint,
            BigDecimal containerSize, Integer containerCount, Integer containersOpened, Integer containerRemainingPercent,
            Integer maintenanceIntervalDays, LocalDate nextMaintenanceDue, BigDecimal currentOperatingHours,
            DomainEnums.MaintenanceStatus maintenanceStatus, List<String> images) {}

    public record StorageLocationInput(
            @NotBlank String name, String description, String area, String location, String position,
            Double latitude, Double longitude, Integer mapZoom, String mapOverlay, List<List<Double>> overlayBounds) {}

    public record AssemblyInput(
            @NotBlank String name, String description, String hint, List<String> eventTypes,
            @NotEmpty Map<UUID, Integer> itemQuantities) {}

    public record TransactionInput(
            @NotNull UUID itemId, @NotNull DomainEnums.TransactionType transactionType,
            @Min(1) int quantityChanged, String reason, String notes, UUID userId, UUID factionOrderId, UUID idempotencyKey) {}

    public record EventInput(
            @NotBlank String eventType, String name, @NotNull LocalDate startDate, LocalDate endDate,
            String status, String notes) {}

    public record FactionInput(@NotBlank String eventType, @NotBlank String name, String slug, Boolean active) {}

    public record OrderInput(
            String eventType, String faction, LocalDate eventDate, UUID eventOccurrenceId, UUID factionId,
            UUID pickupLocation, String collectorName, String notes,
            Map<UUID, Integer> requestedQuantities, Map<UUID, Integer> requestedAssemblyQuantities) {}

    public record PreparationInput(Map<UUID, Integer> preparedQuantities, boolean acknowledgeShortages, UUID idempotencyKey, String notes) {}
    public record ReturnLine(@Min(0) int returned, @Min(0) int missing, @Min(0) int damaged, BigDecimal operatingHours, String notes) {}
    public record ReturnInput(@NotEmpty Map<UUID, ReturnLine> lines, UUID idempotencyKey, String notes) {}
    public record TransitionInput(UUID idempotencyKey, String notes, String collectorName) {}

    public record DamageInput(
            @NotNull UUID itemId, @Min(1) int amount, @NotBlank String description,
            @NotNull DomainEnums.DamageSeverity severity, UUID factionOrderId, UUID idempotencyKey) {}
    public record DamageResolutionInput(@NotNull DomainEnums.DamageStatus status, @Min(1) int amount, String notes, UUID idempotencyKey) {}

    public record MaintenanceInput(
            @NotNull UUID itemId, @NotNull DomainEnums.MaintenanceType type, Instant performedAt,
            Instant nextDueAt, BigDecimal operatingHours, @NotNull DomainEnums.MaintenanceResult result,
            String certificateNumber, String notes) {}

    public record UserPermissionsInput(@NotNull DomainEnums.UserRole role, List<String> faction) {}
    public record DevLoginInput(@NotBlank String email, String password) {}
    public record SyncAction(@NotNull UUID idempotencyKey, @NotBlank String type, @NotNull Map<String, Object> payload, Instant localTimestamp) {}
    public record SyncBatch(@NotEmpty List<SyncAction> actions) {}
}
