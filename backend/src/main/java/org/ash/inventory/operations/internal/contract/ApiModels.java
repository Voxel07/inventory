package org.ash.inventory.operations.internal.contract;

import org.ash.inventory.operations.internal.model.DomainEnums;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
            @jakarta.validation.constraints.DecimalMin("1") @jakarta.validation.constraints.Digits(integer = 9, fraction = 0) BigDecimal containerSize,
            @jakarta.validation.constraints.DecimalMin("0") BigDecimal currentOperatingHours,
            List<String> images,
            DomainEnums.TrackingMode trackingMode, DomainEnums.InventoryRole inventoryRole,
            UUID returnLocation, BigDecimal fuelConsumptionLitersPer100Km,
            LocalDate batteryReplacementDue, LocalDate bestBeforeDate, Boolean privateResource, Boolean publicUse, Boolean tracksRuntime,
            @Size(max = 200) String assetCodePrefix, @Min(1) Integer assetStartNumber,
            @Size(max = 20) List<@NotNull @Valid ItemScheduleInput> maintenanceSchedules,
            @Size(max = 32) String unit, @Min(0) @jakarta.validation.constraints.Max(2) Integer quantityDecimals,
            @jakarta.validation.constraints.DecimalMin("0.001") @jakarta.validation.constraints.Digits(integer = 9, fraction = 3) BigDecimal unitCapacity) {}

    /** Creation only: an item-wide maintenance plan created together with the item. */
    public record ItemScheduleInput(@NotNull DomainEnums.MaintenanceType maintenanceType,
            @NotNull DomainEnums.MaintenanceIntervalType intervalType,
            @NotNull @jakarta.validation.constraints.DecimalMin("0.01") BigDecimal intervalValue,
            Instant nextDueAt, @jakarta.validation.constraints.DecimalMin("0") BigDecimal nextDueValue,
            @jakarta.validation.constraints.DecimalMin("0") BigDecimal warningWindow, boolean checkoutBlocking) {}

    /** One import row: created when {@code id} is absent, otherwise updated; asset codes register serialized units. */
    public record ItemBatchEntry(UUID id, @NotNull @Valid ItemInput item, List<@NotBlank @Size(max = 255) String> assetCodes) {}

    public record ItemBatchInput(@NotEmpty @Size(max = 100) List<@NotNull @Valid ItemBatchEntry> items) {}

    public record ReturnSubmissionInput(
            @NotNull UUID itemId, @Min(1) int quantity, UUID assetInstanceId,
            UUID returnedForUserId, UUID orderId, String placementImage, String notes, UUID eventOccurrenceId) {}

    /** Accepting a return of a runtime-tracked item records the hours run (or the new meter reading). */
    public record ReturnDecisionInput(String notes, @Min(0) BigDecimal hoursRun, @Min(0) BigDecimal meterReading) {}

    public record StorageLocationInput(
            @NotBlank String name, @jakarta.validation.constraints.Size(max = 32) String code, String description,
            Double latitude, Double longitude, Integer mapZoom, String mapOverlay, List<List<Double>> overlayBounds,
            UUID parentLocationId, Boolean active, Boolean privateResource, Boolean keepParent) {}

    /** A top-level location (id null = new) with its sections; see {@code CatalogService.saveStructure}. */
    public record StorageStructureInput(
            UUID id, @NotBlank String name, @jakarta.validation.constraints.Size(max = 32) String code, String description, Boolean privateResource,
            List<@Valid StorageNodeInput> sections) {}

    /** A section or storage place; children nest further (shelf â†’ compartment). */
    public record StorageNodeInput(
            UUID id, @NotBlank String name, @jakarta.validation.constraints.Size(max = 32) String code, String description,
            List<@Valid StorageNodeInput> children) {}

    public record AssemblyInput(
            @NotBlank String name, String category, String subcategory, String description, String hint, List<String> eventTypes,
            @NotEmpty Map<UUID, Integer> itemQuantities, String image, boolean removeImage, Boolean privateResource) {}

    public record TransactionInput(
            @NotNull UUID itemId, @NotNull DomainEnums.TransactionType transactionType,
            @Min(1) int quantityChanged, String reason, String notes, String eventType, String faction,
            UUID assetInstanceId, UUID userId, UUID idempotencyKey, UUID eventOccurrenceId, UUID locationId, UUID lotId,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}

    public record EventInput(
            @NotBlank String eventType, String name, @NotNull LocalDate startDate, LocalDate endDate,
            String status, String notes, Map<UUID, Integer> plannedQuantities, Map<UUID, Integer> usedQuantities, Instant orderDeadline) {}

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
            boolean acknowledgeShortages, UUID idempotencyKey, String notes, Map<UUID, UUID> sourceLocations) {}
    /** {@code missing} is the unresolved total after this command; the other quantities are reconciled now. Consumables are consumed at pickup. */
    public record ReturnLine(
            @Min(0) int returned, @Min(0) int missing, @Min(0) int damaged,
            @Min(0) int writtenOff, BigDecimal operatingHours, String notes) {}
    /**
     * Unused consumables brought back after pickup, per item in the item's steps (7.5 L with one decimal is 75). They
     * leave the consumed total and go back to stock at {@code locationId} (default: the item's return location).
     */
    public record OrderRestockInput(@NotEmpty Map<@NotNull UUID, @NotNull @Min(1) Integer> quantities,
            UUID idempotencyKey, UUID locationId, @Size(max = 2000) String notes) {}
    /** Unused consumables of one direct checkout brought back to stock. */
    public record RestockInput(@Min(1) int quantity, UUID idempotencyKey, UUID locationId, @Size(max = 2000) String notes) {}
    /** A direct consumable checkout that can still take restocked units. */
    public record RestockableCheckout(UUID checkoutId, Instant occurredAt, String person, String event, String faction,
            int issued, int restocked) {}
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
            @NotNull DomainEnums.DamageSeverity severity, UUID orderId, UUID idempotencyKey,
            UUID assetInstanceId, UUID handoverId, boolean safetyImpact, UUID assemblyId,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}
    public record DamageResolutionInput(
            DomainEnums.DamageStatus status, @Min(1) Integer amount, String notes, UUID idempotencyKey,
            String description, DomainEnums.DamageSeverity severity,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}

    public record MaintenanceInput(
            @NotNull UUID itemId, @NotNull DomainEnums.MaintenanceType type, Instant performedAt,
            Instant nextDueAt, BigDecimal operatingHours, @NotNull DomainEnums.MaintenanceResult result,
            String certificateNumber, String notes, UUID assetInstanceId, UUID scheduleId,
            String certificateObjectKey) {}

    public record DevLoginInput(@NotBlank String email, String password) {}
    /** Personal ntfy topic (ntfy topic syntax); null clears it. */
    public record NtfySettingsInput(@jakarta.validation.constraints.Pattern(regexp = "[A-Za-z0-9_-]{1,64}") String topic) {}
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
            LocalDate purchaseDate, @Min(0) BigDecimal purchasePrice, @Min(0) BigDecimal replacementValue,
            DomainEnums.ConditionStatus conditionStatus, DomainEnums.AssetState availabilityStatus,
            UUID currentLocationId, UUID currentCustodianId, BigDecimal operatingHours, String notes, Long expectedVersion) {}

    /** Renames the listed units, in the given order, to {@code codePrefix} + zero-padded consecutive numbers. */
    public record AssetRecodeInput(@NotBlank @Size(max = 200) String codePrefix, @NotNull @Min(1) Integer startNumber,
            @NotEmpty @Size(max = 1000) List<@NotNull UUID> assetIds) {}

    public record AssetIdsInput(@NotEmpty @Size(max = 1000) List<@NotNull UUID> assetIds) {}

    /** Either {@code hours} run or the new meter {@code reading}; the event says where the unit ran. */
    public record RuntimeInput(BigDecimal hours, BigDecimal reading, UUID eventOccurrenceId, String notes, @NotNull Long expectedVersion) {}

    public record AssetRelocationInput(@NotNull UUID locationId, @NotNull Long expectedVersion, String notes) {}

    public record AssetConditionInput(
            @NotNull DomainEnums.ConditionStatus conditionStatus,
            @NotNull Long expectedVersion,
            String notes) {}
}
