package org.ash.inventory.operations.internal.contract.dto;

import org.ash.inventory.operations.internal.application.InventoryAccessService;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Strongly typed response DTO records for OpenAPI specification and JSON serialization.
 */
public final class ApiResponses {
    private ApiResponses() {}

    public sealed interface OrderDetail permits OrderResponse, GeneralOrderResponse {}

    public record StockDto(
            int totalOwned,
            int onHand,
            int checkedOut,
            int inTransit,
            int damaged,
            int reserved,
            int available,
            int maintenance,
            int ordered
    ) {}

    public record StockHistoryResponse(UUID id, Instant timestamp, int total, int available) {}

    public record UserResponse(
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String email,
            String role,
            List<String> roles,
            List<String> faction,
            long revision, boolean active,
            /** Only for the signed-in user; omitted in listings and while the default layout applies. */
            @JsonInclude(JsonInclude.Include.NON_NULL) Map<String, String> mobileNavigation
    ) {}

    /** Attribution outside account administration never discloses contact details or access assignments. */
    public record ActorSummary(UUID id, String name) {}

    public record UserAccessState(List<String> roles, List<String> factions) {}

    public record UserAccessHistoryResponse(UUID id, Instant occurredAt, ActorSummary changedBy,
            UserAccessState before, UserAccessState after, String reason) {}

    public record GeneralOrderResponse(
            String kind,
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String purpose,
            String createdBy,
            String eventOccurrenceId,
            String status,
            Map<String, Integer> requestedQuantities,
            Map<String, Integer> handedOverQuantities,
            Map<String, Integer> returnedQuantities,
            Map<String, Integer> consumedQuantities,
            Map<String, List<String>> assetAssignments,
            Map<String, String> itemNames,
            Map<String, Integer> preparedQuantities,
            Map<String, Integer> damagedQuantities,
            Map<String, Integer> missingQuantities,
            Map<String, Integer> writtenOffQuantities,
            Map<String, List<String>> reconciledAssets,
            List<OrderHistoryResponse> history,
            List<OrderItemRequestResponse> itemRequests,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand, Map<String, Map<String, Integer>> sourceAllocations
    ) implements OrderDetail {}

    public record GeneralOrderSummaryResponse(
            String kind,
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String purpose,
            String createdBy,
            String eventOccurrenceId,
            String status,
            Map<String, Integer> requestedQuantities,
            Map<String, Integer> handedOverQuantities,
            Map<String, Integer> returnedQuantities,
            Map<String, Integer> consumedQuantities,
            Map<String, List<String>> assetAssignments,
            Map<String, String> itemNames,
            Map<String, Integer> preparedQuantities,
            Map<String, Integer> damagedQuantities,
            Map<String, Integer> missingQuantities,
            Map<String, Integer> writtenOffQuantities,
            Map<String, List<String>> reconciledAssets,
            List<OrderItemRequestResponse> itemRequests,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand, Map<String, Map<String, Integer>> sourceAllocations
    ) {}

    public record DevLoginResponse(
            String token,
            UserResponse user
    ) {}

    public record MediaResponse(String key, String url) {}

    public record StorageLocationResponse(
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String code,
            String fullCode,
            /** Null when any ancestor is hidden; otherwise 0 = site, 1 = section, 2+ = place. */
            Integer depth,
            String description,
            Double latitude,
            Double longitude,
            Integer mapZoom,
            String mapOverlay,
            List<List<Double>> overlayBounds,
            String rootLocationId,
            String rootLocationName,
            String parentLocationId,
            boolean active, org.ash.inventory.operations.internal.application.InventoryAccessService.View access,
            String hierarchyPath, UUID keeperUserId, String keeperUserName
    ) {}

    public record ItemResponse(
            UUID id,
            Instant created,
            Instant updated,
            String sku,
            String name,
            String description,
            Integer minStock,
            BigDecimal value,
            String category,
            String subcategory,
            String supplier,
            List<String> eventTypes,
            @com.fasterxml.jackson.annotation.JsonProperty("isConsumable") boolean isConsumable,
            String trackingMode,
            String inventoryRole,
            /** 0 decimals counts whole units; 2 counts 1% steps of a full canister/bag. */
            String unit,
            int quantityDecimals,
            BigDecimal unitCapacity,
            String storageLocation,
            String returnLocation,
            String status,
            List<String> images,
            String hint,
            String positionDetails,
            BigDecimal containerSize,
            Integer containerCount,
            Integer containerRemainingCount,
            LocalDate nextMaintenanceDue,
            BigDecimal currentOperatingHours,
            boolean tracksRuntime,
            BigDecimal fuelConsumptionLitersPer100Km,
            LocalDate batteryReplacementDue,
            LocalDate bestBeforeDate,
            String maintenanceStatus,
            List<MaintenanceBlockResponse> blockingMaintenance,
            StockDto stock,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand,
            org.ash.inventory.operations.internal.application.InventoryAccessService.View access, boolean locationRestricted
    ) {}

    public record MaintenanceBlockResponse(UUID scheduleId, String maintenanceType, String assetCode,
            String status, String intervalType, Instant nextDueAt, BigDecimal nextDueValue) {}

    public record ReturnSubmissionResponse(
            UUID id,
            Instant created,
            Instant updated,
            String itemId,
            String itemName,
            int quantity,
            String assetInstanceId,
            String assetCode,
            String returnedForUserId,
            String returnedForUserName,
            String submittedById,
            String submittedByName,
            String orderId,
            String expectedReturnLocationId,
            String expectedReturnLocationName,
            String placementImage,
            String notes,
            String status,
            String acknowledgedById,
            String acknowledgedByName,
            Instant acknowledgedAt,
            String acknowledgementNotes,
            List<ReturnDamageResponse> reportedDamage,
            boolean tracksRuntime,
            BigDecimal currentOperatingHours,
            BigDecimal runtimeHours,
            String eventName
    ) {}

    /** Open damage the warehouse should see before returning the item to stock; contributor requests carry no severity. */
    public record ReturnDamageResponse(
            UUID id,
            String assetCode,
            int quantity,
            String severity,
            String status,
            String description,
            String reportedByName,
            Instant reportedAt
    ) {}

    public record AssemblyResponse(
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String category,
            String subcategory,
            String description,
            String hint,
            String image,
            List<String> eventTypes,
            Set<String> itemIds,
            Map<String, Integer> itemQuantities,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand,
            org.ash.inventory.operations.internal.application.InventoryAccessService.View access
    ) {}

    public record EventResponse(
            UUID id,
            Instant created,
            Instant updated,
            String eventType,
            String name,
            LocalDate eventDate,
            LocalDate startDate,
            LocalDate endDate,
            String status,
            String notes,
            List<String> itemIds,
            Map<String, Integer> plannedQuantities,
            Map<String, Integer> usedQuantities,
            Map<String, String> itemNames,
            Map<String, Map<String, Integer>> quantities,
            Instant orderDeadline
    ) {}

    public record FactionResponse(
            UUID id,
            Instant created,
            Instant updated,
            String eventType,
            String name,
            String slug,
            Boolean active
    ) {}

    /** Overview metrics computed on the server over every item visible to the caller. */
    public record InventorySummaryResponse(long items, long totalUnits, long lowStockItems, long transactionsLast7Days,
            long openDamageReports) {}

    public record TransactionResponse(
            UUID id,
            Instant created,
            Instant updated,
            String itemId,
            String itemName,
            String userId,
            String transactionType,
            int quantityChanged,
            String assetInstanceId,
            String sourceLocationId,
            String destinationLocationId,
            Integer availabilityBefore,
            Integer availabilityAfter,
            String orderId,
            String eventOccurrenceId,
            String eventType,
            String faction,
            String damageReportId,
            String clientCommandId,
            String reason,
            String notes,
            Instant timestamp,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand, UUID reversesId, ActorSummary reversedBy
    ) {}

    public record OrderLineResponse(
            UUID id,
            UUID itemId,
            String itemName,
            UUID sourceAssemblyId,
            String sourceAssemblyName,
            int requestedQuantity,
            int preparedQuantity,
            int allocatedQuantity,
            int reservedQuantity,
            int handedOverQuantity,
            int returnedQuantity,
            int consumedQuantity,
            int missingQuantity,
            int damagedQuantity,
            int writtenOffQuantity
    ) {}

    public record OrderHistoryResponse(
            String id,
            String action,
            String userId,
            String userName,
            Instant timestamp,
            String fromStatus,
            String toStatus,
            Object deltaSnapshot,
            String note
    ) {}

    public record OrderResponse(
            String kind,
            UUID id,
            Instant created,
            Instant updated,
            String orderCode,
            String eventType,
            UUID eventOccurrenceId,
            LocalDate eventDate,
            LocalDate requestedPickupDate,
            String faction,
            UUID factionId,
            String factionKey,
            String status,
            String pickupLocation,
            Double pickupLatitude,
            Double pickupLongitude,
            String collectorName,
            String notes,
            String createdBy,
            String preparedBy,
            String readyBy,
            String pickedUpBy,
            String returnedBy,
            Set<String> itemIds,
            Map<String, Integer> requestedQuantities,
            Map<String, Integer> preparedQuantities,
            Map<String, Integer> allocatedQuantities,
            Map<String, Integer> reservedQuantities,
            Map<String, Integer> handedOverQuantities,
            Map<String, Integer> returnedQuantities,
            Map<String, Integer> consumedQuantities,
            Map<String, Integer> missingQuantities,
            Map<String, Integer> damagedQuantities,
            Map<String, Integer> writtenOffQuantities,
            Set<String> assemblyIds,
            Map<String, Integer> requestedAssemblyQuantities,
            Map<String, Integer> preparedAssemblyQuantities,
            Map<String, List<AssetInstanceResponse>> assetAssignments,
            List<OrderLineResponse> lines,
            List<OrderHistoryResponse> history,
            List<OrderItemRequestResponse> itemRequests,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
            , Map<String, Map<String, Integer>> sourceAllocations
    ) implements OrderDetail {}

    /** Something an order asks for outside the inventory; {@code status} follows from the item and purchase order links. */
    public record OrderItemRequestResponse(UUID id, String name, int quantity, String link, String note, String status,
            UUID itemId, String itemName, UUID purchaseOrderId, String purchaseOrderNumber, String purchaseOrderStatus,
            String declineReason, String resolvedBy, Instant declinedAt) {}

    /** One request in the procurement queue, with the order it came from. */
    public record ItemRequestQueueEntry(OrderItemRequestResponse request, UUID orderId, String orderKind, String orderLabel,
            String orderStatus, String faction, UUID eventOccurrenceId, String eventName, LocalDate eventDate, String requestedBy) {}

    /** Compact order list projection; expensive audit, asset, and item expansions are detail-only. */
    public record OrderSummaryResponse(
            String kind,
            UUID id,
            Instant created,
            Instant updated,
            String orderCode,
            String eventType,
            UUID eventOccurrenceId,
            LocalDate eventDate,
            LocalDate requestedPickupDate,
            String faction,
            UUID factionId,
            String factionKey,
            String status,
            String pickupLocation,
            Double pickupLatitude,
            Double pickupLongitude,
            String collectorName,
            String notes,
            Set<String> itemIds,
            Map<String, Integer> requestedQuantities,
            Map<String, Integer> preparedQuantities,
            Map<String, Integer> allocatedQuantities,
            Map<String, Integer> reservedQuantities,
            Map<String, Integer> handedOverQuantities,
            Map<String, Integer> returnedQuantities,
            Map<String, Integer> consumedQuantities,
            Map<String, Integer> missingQuantities,
            Map<String, Integer> damagedQuantities,
            Map<String, Integer> writtenOffQuantities,
            Set<String> assemblyIds,
            Map<String, Integer> requestedAssemblyQuantities,
            Map<String, Integer> preparedAssemblyQuantities,
            List<OrderItemRequestResponse> itemRequests,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
    ) {}

    public record DamageResponse(
            UUID id,
            Instant created,
            Instant updated,
            String itemId,
            String itemName,
            String assemblyId,
            String assemblyName,
            int amount,
            int repairedAmount,
            int writtenOffAmount,
            String reportedBy,
            String handledBy,
            String orderId,
            String description,
            String severity,
            String status,
            Instant timestamp,
            String assetInstanceId,
            String assetCode,
            String handoverId,
            boolean safetyImpact,
            String resolutionNotes,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
    ) {}

    public record MaintenanceResponse(
            UUID id,
            String itemId,
            String itemName,
            String type,
            String inspectorUserId,
            Instant performedAt,
            Instant nextDueAt,
            BigDecimal operatingHours,
            String result,
            String certificateNumber,
            String certificateObjectKey,
            String notes,
            Instant created,
            String assetInstanceId,
            String scheduleId
    ) {}

    public record AssetInstanceResponse(
            UUID id,
            Instant createdAt,
            Instant updatedAt,
            UUID itemId,
            String assetCode,
            String serialNumber,
            String manufacturer,
            String model,
            LocalDate purchaseDate,
            BigDecimal purchasePrice,
            BigDecimal replacementValue,
            String conditionStatus,
            String availabilityStatus,
            String serviceStatus,
            LocalDate nextMaintenanceDue,
            BigDecimal operatingHours,
            String currentLocationId,
            String currentLocationCode,
            String currentLocationName,
            String currentCustodianId,
            String currentCustodianName,
            String notes,
            boolean active,
            long version,
            @JsonInclude(JsonInclude.Include.NON_NULL) AssetReservationResponse reservedFor
    ) {}

    /** One runtime booking; {@code eventName} is null for hours run outside an event. */
    public record RuntimeEntryResponse(
            UUID id, UUID itemId, UUID assetInstanceId, String assetCode,
            UUID eventOccurrenceId, String eventName, java.time.LocalDate eventStartDate,
            UUID orderId, String orderLabel,
            BigDecimal hours, BigDecimal readingAfter, String source,
            Instant recordedAt, String recordedByName, String notes) {}

    /** The open order holding a reserved or staged asset. */
    public record AssetReservationResponse(String kind, UUID orderId, String label) {}

    public record OutboxEventResponse(
            UUID id,
            UUID eventId,
            String eventType,
            String aggregateType,
            UUID aggregateId,
            UUID actorId,
            UUID idempotencyKey,
            Instant occurredAt,
            String status,
            int attemptCount,
            Instant availableAt,
            Instant publishedAt,
            String lastError,
            Map<String, Object> payload
    ) {}

    public record OutboxStatusResponse(Map<String, Long> counts) {}

    /** {@code ntfyServer} is the configured ntfy server, null while ntfy delivery is disabled. */
    public record NotificationSettingsResponse(String ntfyServer, String ntfyTopic, String webhookUrl) {}

    public record NotificationResponse(
            UUID id,
            String type,
            Map<String, Object> payload,
            Instant createdAt,
            Instant readAt,
            UUID orderId
    ) {}

    public record DeficitResponse(
            UUID itemId,
            String sku,
            String name,
            String category,
            String supplier,
            String classification,
            int demand,
            int onHandStock,
            int inTransitStock,
            int totalOwnedStock,
            int availableStock,
            int reservedStock,
            int projectedStock,
            int netDeficit,
            int orderedStock,
            String recommendedAction,
            LocalDate requiredDate,
            int lateOrderedStock,
            int safetyStock,
            String overrideReason,
            String overrideActor,
            int committedStock
    ) {}

    public record SyncActionResponse(
            UUID idempotencyKey,
            String status,
            Object entity,
            String error
    ) {}

    public record SyncBatchResponse(List<SyncActionResponse> results) {}

    public record SyncAuditResponse(
            UUID id,
            UUID commandId,
            UUID supersedes,
            String resolutionNote,
            UUID userId,
            String deviceId,
            String operationType,
            Map<String, Object> payload,
            Instant localTimestamp,
            String syncStatus,
            int retryCount,
            Map<String, Object> serverResult,
            String conflictMessage,
            Instant createdAt,
            Instant updatedAt
    ) {}
}
