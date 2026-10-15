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
            List<String> eventTypes, @Min(0) Integer amount, @Min(0) Integer minStock,
            @Min(0) BigDecimal value, UUID storageLocation, String positionDetails, String hint,
            BigDecimal containerSize, Integer containerCount, Integer containersOpened, Integer containerRemainingPercent,
            Integer maintenanceIntervalDays, LocalDate nextMaintenanceDue, BigDecimal currentOperatingHours,
            List<String> images,
            DomainEnums.TrackingMode trackingMode, DomainEnums.InventoryRole inventoryRole,
            UUID returnLocation, BigDecimal fuelConsumptionLitersPer100Km,
            LocalDate batteryReplacementDue, LocalDate bestBeforeDate, Boolean privateResource) {}

    public record ReturnSubmissionInput(
            @NotNull UUID itemId, @Min(1) int quantity, UUID assetInstanceId,
            UUID returnedForUserId, UUID orderId, String placementImage, String notes, UUID eventOccurrenceId) {
        public ReturnSubmissionInput(UUID itemId, int quantity, UUID assetInstanceId, UUID returnedForUserId,
                UUID orderId, String placementImage, String notes) {
            this(itemId, quantity, assetInstanceId, returnedForUserId, orderId, placementImage, notes, null);
        }
    }

    public record ReturnDecisionInput(String notes) {}

    public record StorageLocationInput(
            @NotBlank String name, String description, String area, String location, String position,
            Double latitude, Double longitude, Integer mapZoom, String mapOverlay, List<List<Double>> overlayBounds,
            DomainEnums.LocationType locationType, UUID warehouseId, UUID parentLocationId, Boolean active, Boolean privateResource) {}


    public record AssemblyInput(
            @NotBlank String name, String description, String hint, List<String> eventTypes,
            @NotEmpty Map<UUID, Integer> itemQuantities, String image, boolean removeImage, Boolean privateResource) {}

    public record TransactionInput(
            @NotNull UUID itemId, @NotNull DomainEnums.TransactionType transactionType,
            @Min(1) int quantityChanged, String reason, String notes, String eventType, String faction,
            UUID assetInstanceId, UUID userId, UUID factionOrderId, UUID idempotencyKey, UUID eventOccurrenceId, UUID locationId, UUID lotId,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {
        public TransactionInput(UUID itemId, DomainEnums.TransactionType transactionType, int quantityChanged,
                String reason, String notes, String eventType, String faction, UUID assetInstanceId,
                UUID userId, UUID factionOrderId, UUID idempotencyKey, UUID eventOccurrenceId) {
            this(itemId, transactionType, quantityChanged, reason, notes, eventType, faction,
                    assetInstanceId, userId, factionOrderId, idempotencyKey, eventOccurrenceId, null, null, null);
        }
        public TransactionInput(UUID itemId, DomainEnums.TransactionType transactionType, int quantityChanged,
                String reason, String notes, String eventType, String faction, UUID assetInstanceId,
                UUID userId, UUID factionOrderId, UUID idempotencyKey) {
            this(itemId, transactionType, quantityChanged, reason, notes, eventType, faction,
                    assetInstanceId, userId, factionOrderId, idempotencyKey, null, null, null, null);
        }
    }

    public record EventInput(
            @NotBlank String eventType, String name, @NotNull LocalDate startDate, LocalDate endDate,
            String status, String notes, Map<UUID, Integer> plannedQuantities, Map<UUID, Integer> usedQuantities) {}

    public record FactionInput(@NotBlank String eventType, @NotBlank String name, String slug, Boolean active) {}

    public record OrderInput(
            String eventType, String faction, LocalDate eventDate, UUID eventOccurrenceId, UUID factionId,
            LocalDate requestedPickupDate,
            UUID pickupLocation, Double pickupLatitude, Double pickupLongitude, String collectorName, String notes,
            Map<UUID, Integer> requestedQuantities, Map<UUID, Integer> requestedAssemblyQuantities,
            UUID idempotencyKey) {}

    public record GeneralOrderInput(@NotBlank @jakarta.validation.constraints.Size(max = 160) String name,
            @NotBlank @jakarta.validation.constraints.Size(max = 4000) String purpose,
            UUID eventOccurrenceId, Map<UUID, Integer> requestedQuantities, UUID idempotencyKey) {}

    public record PreparationInput(Map<@NotNull UUID, @NotNull @Min(0) Integer> preparedQuantities,
            Map<@NotNull UUID, @NotNull List<@NotNull UUID>> assetAssignments,
            boolean acknowledgeShortages, UUID idempotencyKey, String notes, Map<UUID, UUID> sourceLocations) {
        public PreparationInput(Map<UUID, Integer> quantities, Map<UUID, List<UUID>> assets, boolean acknowledge, UUID key, String notes) {
            this(quantities, assets, acknowledge, key, notes, null);
        }
    }
    /** {@code missing} is the unresolved total after this command; the other quantities are reconciled now. */
    public record ReturnLine(
            @Min(0) int returned, @Min(0) int consumed, @Min(0) int missing, @Min(0) int damaged,
            @Min(0) int writtenOff, BigDecimal operatingHours, String notes) {}
    public record AssetReturnLine(
            @NotNull DomainEnums.ReconciliationOutcome outcome,
            BigDecimal operatingHours,
            String notes) {}
    public record ReturnInput(
            @NotEmpty Map<@NotNull UUID, @NotNull @jakarta.validation.Valid ReturnLine> lines,
            Map<@NotNull UUID, @NotNull @jakarta.validation.Valid AssetReturnLine> assets,
            UUID idempotencyKey,
            String notes) {}
    public record TransitionInput(
            UUID idempotencyKey, String notes, String collectorName,
            UUID pickupLocation, Double pickupLatitude, Double pickupLongitude) {}

    public record DamageInput(
            UUID itemId, @Min(1) int amount, @NotBlank @jakarta.validation.constraints.Size(max = 2000) String description,
            @NotNull DomainEnums.DamageSeverity severity, UUID factionOrderId, UUID idempotencyKey,
            UUID assetInstanceId, UUID handoverId, boolean safetyImpact, UUID assemblyId,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}
    public record DamageResolutionInput(
            DomainEnums.DamageStatus status, @Min(1) Integer amount, String notes, UUID idempotencyKey,
            String description, DomainEnums.DamageSeverity severity, String itemHint,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}

    public record MaintenanceInput(
            @NotNull UUID itemId, @NotNull DomainEnums.MaintenanceType type, Instant performedAt,
            Instant nextDueAt, BigDecimal operatingHours, @NotNull DomainEnums.MaintenanceResult result,
            String certificateNumber, String notes, UUID assetInstanceId, UUID scheduleId,
            String certificateObjectKey) {}

    public record DevLoginInput(@NotBlank String email, String password) {}
    /** Role and faction memberships (`EVENT:slug`) set by the inventory admin. */
    public record UserAccessInput(@NotNull @jakarta.validation.constraints.Size(min = 1, max = 6) List<@NotBlank String> roles,
            @NotNull @jakarta.validation.constraints.Size(max = 100) List<String> factions,
            @NotNull Long revision, @NotBlank @jakarta.validation.constraints.Size(max = 1000) String reason) {}
    public record SyncAction(@NotNull UUID idempotencyKey, @NotBlank String type,
            @NotNull Map<String, Object> payload, Instant localTimestamp, String deviceId, Integer retryCount,
            UUID supersedes, @jakarta.validation.constraints.Size(max = 2000) String resolutionNote) {}
    public record SyncBatch(@NotEmpty @jakarta.validation.constraints.Size(max = 100) List<@jakarta.validation.Valid SyncAction> actions) {}

    public record AssetInstanceInput(
            String assetCode, String serialNumber, String manufacturer, String model,
            DomainEnums.ConditionStatus conditionStatus, DomainEnums.AssetState availabilityStatus,
            UUID currentLocationId, UUID currentCustodianId, BigDecimal operatingHours, String notes,
            Integer batchCount, String codePrefix, Integer startNumber, Long expectedVersion) {}

    public record AssetRelocationInput(@NotNull UUID locationId, @NotNull Long expectedVersion, String notes) {}

    public record AssetConditionInput(
            @NotNull DomainEnums.ConditionStatus conditionStatus,
            @NotNull Long expectedVersion,
            String notes) {}
}
