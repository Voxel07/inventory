package org.ash.inventory.mcp;

import java.util.List;
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
            long activeLocations, long upcomingEventsCount) {}

    /** One evaluated catalog page; request {@code page + 1} while {@code hasMore}. */
    public record AlertPage<T>(List<T> alerts, int page, int limit, boolean hasMore) {}
    public record ResourcePage<T>(List<T> rows, int page, int limit, boolean hasMore, Integer nextPage, String continuationTool) {}

    public record MaintenanceAlertDto(String type, UUID entityId, String codeOrSku,
            String name, String issue, String status, String dueDate) {}

    public record DeleteResultDto(boolean success, String entityType, UUID id, String message) {}
}
