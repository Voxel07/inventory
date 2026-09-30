package org.ash.inventory.mcp;

import java.util.UUID;

/** MCP-specific projections. Catalog tools use the shared, explicit API records. */
public final class InventoryMcpDtos {
    private InventoryMcpDtos() {}

    public record StockPositionDto(UUID id, String locationId, String locationName,
            int quantityOnHand, int quantityReserved, int availableQuantity,
            int quantityDamaged, int quantityQuarantined, int quantityInTransit,
            String lotNumber, String expiryDate) {}

    public record LowStockAlertDto(UUID itemId, String sku, String name,
            int currentOnHand, int currentAvailable, int minStock, int deficit, String primaryLocation) {}

    public record OperationalMetricsDto(long totalActiveItems, long totalSerializedAssets,
            long activeLocations, long upcomingEventsCount, long maintenanceAlertsCount) {}

    public record MaintenanceAlertDto(String type, UUID entityId, String codeOrSku,
            String name, String issue, String status, String dueDate) {}

    public record DeleteResultDto(boolean success, String entityType, UUID id, String message) {}
}
