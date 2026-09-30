package org.ash.inventory.mcp;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class InventoryMcpDtos {
    private InventoryMcpDtos() {}

    public record ItemSummaryDto(
            UUID id,
            String sku,
            String name,
            String category,
            String subcategory,
            String ownershipType,
            String trackingMode,
            int minStock,
            int baseAmount,
            String locationName,
            boolean active
    ) {}

    public record ItemDetailDto(
            UUID id,
            String sku,
            String name,
            String description,
            String category,
            String subcategory,
            String supplier,
            String ownershipType,
            String ownerName,
            String keeperName,
            String trackingMode,
            String inventoryRole,
            int minStock,
            int baseAmount,
            int unitValueCents,
            String storageLocationId,
            String storageLocationName,
            String returnLocationName,
            String positionDetails,
            String hint,
            String maintenanceStatus,
            String nextMaintenanceDue,
            boolean consumable,
            boolean active
    ) {}

    public record AssemblySummaryDto(
            UUID id,
            String name,
            String description,
            String hint,
            List<String> eventTags,
            int componentCount
    ) {}

    public record AssemblyComponentDto(
            UUID itemId,
            String sku,
            String name,
            String category,
            int quantity
    ) {}

    public record AssemblyDetailDto(
            UUID id,
            String name,
            String description,
            String hint,
            List<String> eventTags,
            List<AssemblyComponentDto> components
    ) {}

    public record LocationDto(
            UUID id,
            String name,
            String description,
            String locationType,
            String area,
            String location,
            String position,
            String warehouseName,
            Double latitude,
            Double longitude
    ) {}

    public record StockPositionDto(
            UUID id,
            String locationId,
            String locationName,
            int quantityOnHand,
            int quantityReserved,
            int availableQuantity,
            int quantityInTransit,
            String lotNumber,
            String expiryDate
    ) {}

    public record AssetInstanceDto(
            UUID id,
            String assetCode,
            String serialNumber,
            String manufacturer,
            String model,
            String conditionStatus,
            String availabilityStatus,
            String serviceStatus,
            String locationName,
            String custodianName,
            String notes
    ) {}

    public record EventOccurrenceDto(
            UUID id,
            String name,
            String eventType,
            String startDate,
            String endDate,
            String status,
            String notes,
            Map<String, Integer> plannedQuantities,
            Map<String, Integer> usedQuantities
    ) {}

    public record LowStockAlertDto(
            UUID itemId,
            String sku,
            String name,
            int currentOnHand,
            int currentAvailable,
            int minStock,
            int deficit,
            String primaryLocation
    ) {}

    public record OperationalMetricsDto(
            long totalActiveItems,
            long totalSerializedAssets,
            long activeLocations,
            long upcomingEventsCount,
            long maintenanceAlertsCount
    ) {}

    public record MaintenanceAlertDto(
            String type,
            UUID entityId,
            String codeOrSku,
            String name,
            String issue,
            String status,
            String dueDate
    ) {}

    public record DeleteResultDto(
            boolean success,
            String entityType,
            UUID id,
            String message
    ) {}
}
