package org.ash.inventory.operations.internal.contract;

import org.ash.inventory.platform.api.InputText;
import org.ash.inventory.platform.api.InputDecimal;

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
            @InputText String sku, @NotBlank @InputText String name, @InputText(max = 16000) String description, @NotBlank @InputText String category, @InputText String subcategory, @InputText String supplier,
            @InputText(max = 2048) String purchaseUrl,
            @Size(max = 100) List<@NotBlank @InputText String> eventTypes, @Min(0) Integer amount, @Min(0) Integer minStock,
            @Min(0) @jakarta.validation.constraints.DecimalMax("21474836.47") @jakarta.validation.constraints.Digits(integer = 8, fraction = 2) BigDecimal value, UUID storageLocation, @InputText String positionDetails, @InputText String hint,
            @jakarta.validation.constraints.DecimalMin("1") @jakarta.validation.constraints.Digits(integer = 9, fraction = 0) BigDecimal containerSize,
            @jakarta.validation.constraints.DecimalMin("0") @InputDecimal BigDecimal currentOperatingHours,
            @Size(max = 8) List<@NotBlank @InputText(max = 1000) String> images,
            DomainEnums.TrackingMode trackingMode, DomainEnums.InventoryRole inventoryRole,
            UUID returnLocation, @InputDecimal BigDecimal fuelConsumptionLitersPer100Km,
            LocalDate batteryReplacementDue, LocalDate bestBeforeDate, Boolean privateResource, Boolean publicUse, Boolean tracksRuntime,
            @InputText(max = 200) String assetCodePrefix, @Min(1) Integer assetStartNumber,
            @Size(max = 20) List<@NotNull @Valid ItemScheduleInput> maintenanceSchedules,
            @InputText(max = 32) String unit, @Min(0) @jakarta.validation.constraints.Max(2) Integer quantityDecimals,
            @jakarta.validation.constraints.DecimalMin("0.001") @jakarta.validation.constraints.Digits(integer = 9, fraction = 3) BigDecimal unitCapacity) {}

    /** Creation only: an item-wide maintenance plan created together with the item. */
    public record ItemScheduleInput(@NotNull DomainEnums.MaintenanceType maintenanceType,
            @NotNull DomainEnums.MaintenanceIntervalType intervalType,
            @NotNull @jakarta.validation.constraints.DecimalMin("0.01") @InputDecimal BigDecimal intervalValue,
            Instant nextDueAt, @jakarta.validation.constraints.DecimalMin("0") @InputDecimal BigDecimal nextDueValue,
            @jakarta.validation.constraints.DecimalMin("0") @InputDecimal BigDecimal warningWindow, boolean checkoutBlocking) {}

    /** One import row: created when {@code id} is absent, otherwise updated; asset codes register serialized units. */
    public record ItemBatchEntry(UUID id, @NotNull @Valid ItemInput item, @Size(max = 1000) List<@NotBlank @InputText String> assetCodes) {}

    public record ItemBatchInput(@NotEmpty @Size(max = 100) List<@NotNull @Valid ItemBatchEntry> items) {}

    public record ReturnSubmissionInput(
            @NotNull UUID itemId, @Min(1) int quantity, UUID assetInstanceId,
            UUID returnedForUserId, UUID orderId, @InputText(max = 1000) String placementImage, @InputText String notes, UUID eventOccurrenceId) {}

    /** Accepting a return of a runtime-tracked item records the hours run (or the new meter reading). */
    public record ReturnDecisionInput(@InputText String notes, @Min(0) @InputDecimal BigDecimal hoursRun, @Min(0) @InputDecimal BigDecimal meterReading) {}

    public record StorageLocationInput(
            @NotBlank @InputText String name, @InputText(max = 32) String code, @InputText String description,
            @jakarta.validation.constraints.DecimalMin("-90") @jakarta.validation.constraints.DecimalMax("90") Double latitude,
            @jakarta.validation.constraints.DecimalMin("-180") @jakarta.validation.constraints.DecimalMax("180") Double longitude,
            @Min(0) @jakarta.validation.constraints.Max(22) Integer mapZoom, @InputText(max = 1000) String mapOverlay,
            @Size(min = 2, max = 2) List<@NotNull @Size(min = 2, max = 2) List<@NotNull Double>> overlayBounds,
            UUID parentLocationId, Boolean active, Boolean privateResource, Boolean keepParent) {}

    /** A top-level location (id null = new) with its sections; see {@code CatalogService.saveStructure}. */
    public record StorageStructureInput(
            UUID id, @NotBlank @InputText String name, @InputText(max = 32) String code, @InputText String description, Boolean privateResource,
            @Size(max = 999) List<@NotNull @Valid StorageNodeInput> sections) {}

    /** A section or storage place; children nest further (shelf to compartment). */
    public record StorageNodeInput(
            UUID id, @NotBlank @InputText String name, @InputText(max = 32) String code, @InputText String description,
            @Size(max = 999) List<@NotNull @Valid StorageNodeInput> children) {}

    public record AssemblyInput(
            @NotBlank @InputText String name, @InputText String category, @InputText String subcategory, @InputText String description, @InputText String hint, @Size(max = 100) List<@NotBlank @InputText String> eventTypes,
            @NotEmpty @Size(max = 1000) Map<@NotNull UUID, @NotNull @Min(1) Integer> itemQuantities, @InputText(max = 1000) String image, boolean removeImage, Boolean privateResource) {}

    public record TransactionInput(
            @NotNull UUID itemId, @NotNull DomainEnums.TransactionType transactionType,
            @Min(1) int quantityChanged, @InputText String reason, @InputText String notes, @InputText String eventType, @InputText String faction,
            UUID assetInstanceId, UUID userId, UUID idempotencyKey, UUID eventOccurrenceId, UUID locationId, UUID lotId,
            @jakarta.validation.Valid org.ash.inventory.operations.internal.contract.dto.StockDtos.LotInput newLot,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}

    public record EventInput(
            @NotBlank @InputText String eventType, @InputText String name, @NotNull LocalDate startDate, LocalDate endDate,
            @jakarta.validation.constraints.Pattern(regexp = "planned|completed|cancelled") @InputText String status, @InputText String notes,
            @Size(max = 2000) Map<@NotNull UUID, @NotNull @Min(0) Integer> plannedQuantities,
            @Size(max = 2000) Map<@NotNull UUID, @NotNull @Min(0) Integer> usedQuantities, Instant orderDeadline) {}

    public record FactionInput(@NotBlank @InputText String eventType, @NotBlank @InputText String name, @InputText String slug, Boolean active) {}

    public record OrderInput(
            @InputText String eventType, @InputText String faction, LocalDate eventDate, UUID eventOccurrenceId, UUID factionId,
            LocalDate requestedPickupDate,
            UUID pickupLocation, @jakarta.validation.constraints.DecimalMin("-90") @jakarta.validation.constraints.DecimalMax("90") Double pickupLatitude,
            @jakarta.validation.constraints.DecimalMin("-180") @jakarta.validation.constraints.DecimalMax("180") Double pickupLongitude, @InputText String collectorName, @InputText String notes,
            @Size(max = 2000) Map<@NotNull UUID, @NotNull @Min(1) Integer> requestedQuantities,
            @Size(max = 1000) Map<@NotNull UUID, @NotNull @Min(1) Integer> requestedAssemblyQuantities,
            @Size(max = 200) List<@NotNull @Valid ItemRequestInput> itemRequests, UUID idempotencyKey) {}

    public record GeneralOrderInput(@NotBlank @InputText(max = 160) String name,
            @NotBlank @InputText(max = 4000) String purpose,
            UUID eventOccurrenceId, @Size(max = 2000) Map<@NotNull UUID, @NotNull @Min(1) Integer> requestedQuantities,
            @Size(max = 200) List<@NotNull @Valid ItemRequestInput> itemRequests,
            UUID idempotencyKey) {}

    /** Something the inventory does not hold yet; {@code id} names an existing open request of the order. */
    public record ItemRequestInput(UUID id, @NotBlank @InputText(max = 160) String name, @Min(1) int quantity,
            @InputText(max = 2000) String link, @InputText(max = 2000) String note) {}

    public record ItemRequestAssignment(@NotNull UUID itemId) {}
    public record ItemRequestDecline(@NotBlank @InputText(max = 2000) String reason) {}

    public record PreparationInput(@Size(max = 2000) Map<@NotNull UUID, @NotNull @Min(0) Integer> preparedQuantities,
            @Size(max = 2000) Map<@NotNull UUID, @NotNull @Size(max = 1000) List<@NotNull UUID>> assetAssignments,
            boolean acknowledgeShortages, UUID idempotencyKey, @InputText String notes,
            @Size(max = 2000) Map<@NotNull UUID, @NotNull @Size(max = 1000) Map<@NotNull UUID, @NotNull @Min(1) Integer>> sourceAllocations) {}
    /** {@code missing} is the unresolved total after this command; the other quantities are reconciled now. Consumables are consumed at pickup. */
    public record ReturnLine(
            @Min(0) int returned, @Min(0) int missing, @Min(0) int damaged,
            @Min(0) int writtenOff, @InputDecimal BigDecimal operatingHours, @InputText String notes) {}
    /**
     * Unused consumables brought back after pickup, per item in the item's steps (7.5 L with one decimal is 75). They
     * leave the consumed total and go back to stock at {@code locationId} (default: the item's return location).
     */
    public record OrderRestockInput(@NotEmpty @Size(max = 2000) Map<@NotNull UUID, @NotNull @Min(1) Integer> quantities,
            UUID idempotencyKey, UUID locationId, @InputText String notes) {}
    /** Unused consumables of one direct checkout brought back to stock. */
    public record RestockInput(@Min(1) int quantity, UUID idempotencyKey, UUID locationId, @InputText String notes) {}
    /** A direct consumable checkout that can still take restocked units. */
    public record RestockableCheckout(UUID checkoutId, Instant occurredAt, String person, String event, String faction,
            int issued, int restocked) {}
    public record AssetReturnLine(
            @NotNull DomainEnums.ReconciliationOutcome outcome,
            @InputDecimal BigDecimal operatingHours,
            @InputText String notes) {}
    public record ReturnInput(
            @NotEmpty @Size(max = 2000) Map<@NotNull UUID, @NotNull @jakarta.validation.Valid ReturnLine> lines,
            @Size(max = 2000) Map<@NotNull UUID, @NotNull @jakarta.validation.Valid AssetReturnLine> assets,
            UUID idempotencyKey,
            @InputText String notes) {}
    public record TransitionInput(
            UUID idempotencyKey, @InputText String notes, @InputText String collectorName,
            UUID pickupLocation, @jakarta.validation.constraints.DecimalMin("-90") @jakarta.validation.constraints.DecimalMax("90") Double pickupLatitude,
            @jakarta.validation.constraints.DecimalMin("-180") @jakarta.validation.constraints.DecimalMax("180") Double pickupLongitude) {}

    public record DamageInput(
            UUID itemId, @Min(1) int amount, @NotBlank @InputText(max = 2000) String description,
            @NotNull DomainEnums.DamageSeverity severity, UUID orderId, UUID idempotencyKey,
            UUID assetInstanceId, UUID handoverId, boolean safetyImpact, UUID assemblyId,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt, UUID positionId) {}
    public record DamageResolutionInput(
            DomainEnums.DamageStatus status, @Min(1) Integer amount, @InputText String notes, UUID idempotencyKey,
            @InputText(max = 2000) String description, DomainEnums.DamageSeverity severity,
            @jakarta.validation.constraints.PastOrPresent Instant occurredAt) {}

    public record MaintenanceInput(
            @NotNull UUID itemId, @NotNull DomainEnums.MaintenanceType type, @jakarta.validation.constraints.PastOrPresent Instant performedAt,
            Instant nextDueAt, @jakarta.validation.constraints.DecimalMin("0") @InputDecimal BigDecimal operatingHours, @NotNull DomainEnums.MaintenanceResult result,
            @InputText String certificateNumber, @InputText String notes, UUID assetInstanceId, UUID scheduleId,
            @InputText(max = 1000) String certificateObjectKey) {}

    public record DevLoginInput(@NotBlank @InputText String email) {}
    /** The current user's delivery channels: ntfy topic (ntfy topic syntax) and HTTPS webhook URL; null or blank clears one. */
    public record NotificationSettingsInput(@jakarta.validation.constraints.Pattern(regexp = "[A-Za-z0-9_-]{1,64}|") @InputText String ntfyTopic,
            @InputText(max = 2048) String webhookUrl) {}
    /**
     * The current user's phone navigation. Keys are `tasks`, `scanner` or a route: up to four bottom-bar and two top-bar
     * destinations in display order, destinations hidden on phones, and whether the profile button opens the inbox.
     */
    public record MobileNavigationInput(
            @NotNull @jakarta.validation.constraints.Size(max = 4) List<@NotNull @jakarta.validation.constraints.Pattern(regexp = MOBILE_DESTINATION) String> bottom,
            @NotNull @jakarta.validation.constraints.Size(max = 2) List<@NotNull @jakarta.validation.constraints.Pattern(regexp = MOBILE_DESTINATION) String> top,
            @NotNull @jakarta.validation.constraints.Size(max = 50) List<@NotNull @jakarta.validation.constraints.Pattern(regexp = MOBILE_DESTINATION) String> hidden,
            boolean inboxInProfile) {}
    public static final String MOBILE_DESTINATION = "tasks|scanner|/[a-z0-9/-]{0,63}";
    /** Role and faction memberships (`EVENT:slug`) set by the inventory admin. */
    public record UserAccessInput(@NotNull @jakarta.validation.constraints.Size(min = 1, max = 6) List<@NotBlank @InputText String> roles,
            @NotNull @jakarta.validation.constraints.Size(max = 100) List<@NotBlank @InputText String> factions,
            @NotNull Long revision, @NotBlank @InputText(max = 1000) String reason) {}
    public record SyncAction(@NotNull UUID idempotencyKey, @NotBlank @InputText String type,
            @NotNull @Size(max = 100) Map<@NotBlank @InputText String, Object> payload, Instant localTimestamp, @InputText String deviceId, @Min(0) Integer retryCount,
            UUID supersedes, @InputText(max = 2000) String resolutionNote) {}
    public record SyncBatch(@NotEmpty @jakarta.validation.constraints.Size(max = 100) List<@NotNull @jakarta.validation.Valid SyncAction> actions) {}

    public record AssetInstanceInput(
            @InputText String assetCode, @InputText String serialNumber, @InputText String manufacturer, @InputText String model,
            LocalDate purchaseDate, @Min(0) @jakarta.validation.constraints.DecimalMax("21474836.47") @jakarta.validation.constraints.Digits(integer = 8, fraction = 2) BigDecimal purchasePrice, @Min(0) @jakarta.validation.constraints.DecimalMax("21474836.47") @jakarta.validation.constraints.Digits(integer = 8, fraction = 2) BigDecimal replacementValue,
            DomainEnums.ConditionStatus conditionStatus, DomainEnums.AssetState availabilityStatus,
            UUID currentLocationId, UUID currentCustodianId, @InputDecimal BigDecimal operatingHours, @InputText String notes, Long expectedVersion) {}

    /** Renames the listed units, in the given order, to {@code codePrefix} + zero-padded consecutive numbers. */
    public record AssetRecodeInput(@NotBlank @InputText(max = 200) String codePrefix, @NotNull @Min(1) Integer startNumber,
            @NotEmpty @Size(max = 1000) List<@NotNull UUID> assetIds) {}

    public record AssetIdsInput(@NotEmpty @Size(max = 1000) List<@NotNull UUID> assetIds) {}

    /** Either {@code hours} run or the new meter {@code reading}; the event says where the unit ran. */
    public record RuntimeInput(@InputDecimal BigDecimal hours, @InputDecimal BigDecimal reading, UUID eventOccurrenceId, @InputText String notes, @NotNull Long expectedVersion) {}

    public record AssetRelocationInput(@NotNull UUID locationId, @NotNull Long expectedVersion, @InputText String notes) {}

    public record AssetConditionInput(
            @NotNull DomainEnums.ConditionStatus conditionStatus,
            @NotNull Long expectedVersion,
            @InputText String notes) {}
}
