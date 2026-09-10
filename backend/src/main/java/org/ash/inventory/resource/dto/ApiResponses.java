package org.ash.inventory.resource.dto;

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

    public record StockDto(
            int totalOwned,
            int onHand,
            int checkedOut,
            int damaged,
            int reserved,
            int available
    ) {}

    public record UserResponse(
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String username,
            String email,
            String role,
            List<String> faction
    ) {}

    public record GeneralOrderResponse(
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String purpose,
            String createdBy,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
    ) {}

    public record StorageLocationResponse(
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String locationType,
            String description,
            String area,
            String location,
            String position,
            Double latitude,
            Double longitude,
            Integer mapZoom,
            String mapOverlay,
            List<List<Double>> overlayBounds
    ) {}

    public record ItemResponse(
            UUID id,
            Instant created,
            Instant updated,
            String sku,
            String name,
            String description,
            Integer amount,
            Integer minStock,
            BigDecimal value,
            String category,
            String subcategory,
            String supplier,
            List<String> eventTypes,
            @com.fasterxml.jackson.annotation.JsonProperty("isConsumable") boolean isConsumable,
            String trackingMode,
            String inventoryRole,
            String storageLocation,
            String status,
            List<String> images,
            String hint,
            String positionDetails,
            BigDecimal containerSize,
            Integer containerCount,
            Integer containersOpened,
            Integer containerRemainingPercent,
            Integer maintenanceIntervalDays,
            LocalDate nextMaintenanceDue,
            BigDecimal currentOperatingHours,
            String maintenanceStatus,
            StockDto stock,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
    ) {}

    public record AssemblyResponse(
            UUID id,
            Instant created,
            Instant updated,
            String name,
            String description,
            String hint,
            String image,
            List<String> eventTypes,
            Set<String> itemIds,
            Map<String, Integer> itemQuantities,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
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
            Map<String, Integer> usedQuantities
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

    public record TransactionResponse(
            UUID id,
            Instant created,
            Instant updated,
            String itemId,
            String userId,
            String transactionType,
            int quantityChanged,
            String assetInstanceId,
            String sourceLocationId,
            String destinationLocationId,
            Integer availabilityBefore,
            Integer availabilityAfter,
            String factionOrderId,
            String eventType,
            String faction,
            String damageReportId,
            String clientCommandId,
            String reason,
            String notes,
            Instant timestamp,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
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
            List<OrderLineResponse> lines,
            List<OrderHistoryResponse> history,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
    ) {}

    public record DamageResponse(
            UUID id,
            Instant created,
            Instant updated,
            String itemId,
            int amount,
            int repairedAmount,
            int writtenOffAmount,
            String reportedBy,
            String handledBy,
            String factionOrderId,
            String description,
            String severity,
            String status,
            Instant timestamp,
            @JsonInclude(JsonInclude.Include.NON_EMPTY) Map<String, Object> expand
    ) {}

    public record MaintenanceResponse(
            UUID id,
            String itemId,
            String type,
            String inspectorUserId,
            Instant performedAt,
            Instant nextDueAt,
            BigDecimal operatingHours,
            String result,
            String certificateNumber,
            String notes,
            Instant created
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
            String conditionStatus,
            String availabilityStatus,
            String serviceStatus,
            BigDecimal operatingHours,
            String currentLocationId,
            String currentLocationName,
            String currentCustodianId,
            String currentCustodianName,
            String notes,
            boolean active
    ) {}
}
