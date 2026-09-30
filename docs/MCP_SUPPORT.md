# Model Context Protocol (MCP) Server for ASH Inventory

This document details the MCP integration added to the ASH Inventory Quarkus application.

## Overview

The Quarkus backend exposes an **MCP Server** via the `quarkus-mcp-server-http` extension. This enables AI coding assistants, autonomous agents, and MCP clients (such as Claude Desktop, Cursor, Antigravity, or MCP Inspector) to interact directly with the inventory system using standard MCP tools, resources, and prompt templates.

- **Extension:** `io.quarkiverse.mcp:quarkus-mcp-server-http:2.0.1`
- **Transport:** Streamable HTTP & Server-Sent Events (SSE)
- **Base Endpoint:** `http://localhost:8080/mcp` (Streamable HTTP)
- **SSE Endpoint:** `http://localhost:8080/mcp/sse`

---

## Configuration

In `backend/src/main/resources/application.properties`:

```properties
# Model Context Protocol (MCP) Server
quarkus.mcp.server.http.root-path=/mcp
quarkus.mcp.server.server-info.name=ash-inventory-mcp
quarkus.mcp.server.server-info.title=ASH Inventory MCP Server
quarkus.mcp.server.server-info.version=1.0.0
quarkus.mcp.server.server-info.description=Model Context Protocol server for the ASH Event-Driven Inventory Management System
quarkus.mcp.server.traffic-logging.enabled=false
%dev.quarkus.mcp.server.traffic-logging.enabled=true
```

---

## Connecting MCP Clients

### 1. Claude Desktop / Antigravity / Cursor (`mcp.json` / Claude Config)

Add the following to your MCP client configuration (e.g. `claude_desktop_config.json` or Antigravity MCP config):

```json
{
  "mcpServers": {
    "ash-inventory": {
      "url": "http://localhost:8080/mcp",
      "transport": "http"
    }
  }
}
```

Or for SSE:
```json
{
  "mcpServers": {
    "ash-inventory": {
      "url": "http://localhost:8080/mcp/sse",
      "transport": "sse"
    }
  }
}
```

### 2. Testing with MCP Inspector

You can interactively inspect and invoke tools using the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector http://localhost:8080/mcp
```

---

## Exposed MCP Capabilities

### Tools (`@Tool`)

Implemented in `org.ash.inventory.mcp.InventoryMcpTools`:

#### Item Operations (CRUD)
| Tool | Parameters | Description |
|---|---|---|
| `create_item` | `name`, `category`, `sku` (opt), `description` (opt), `subcategory` (opt), `supplier` (opt), `consumable` (opt), `amount` (opt), `minStock` (opt), `unitValue` (opt), `storageLocationId` (opt), `positionDetails` (opt), `hint` (opt), `trackingMode` (opt), `inventoryRole` (opt) | Create a new catalog item with optional initial stock position and serialized asset generation |
| `get_item_details` | `itemId` (string UUID, required) | Retrieve complete item metadata, stock levels, locations, tracking mode, and maintenance specs |
| `search_items` | `query` (optional string), `category` (optional string), `limit` (optional int) | Search items across SKU, name, or category with pagination |
| `update_item` | `itemId` (required UUID), `name` (opt), `description` (opt), `category` (opt), `subcategory` (opt), `supplier` (opt), `minStock` (opt), `unitValue` (opt), `storageLocationId` (opt), `returnLocationId` (opt), `positionDetails` (opt), `hint` (opt), `maintenanceIntervalDays` (opt), `consumable` (opt), `inventoryRole` (opt) | Update existing item metadata, thresholds, and storage locations |
| `delete_item` | `itemId` (string UUID, required), `permanent` (boolean, optional) | Soft-deletes (retires) item preserving history, or permanently removes if no stock/transactions exist |

#### Assembly Operations (CRUD)
| Tool | Parameters | Description |
|---|---|---|
| `create_assembly` | `name`, `description` (opt), `hint` (opt), `eventTypes` (opt), `itemQuantities` (required map of item UUID to integer quantity) | Create a new kit / package assembly composed of multiple catalog items |
| `get_assembly_details` | `assemblyId` (string UUID, required) | Get assembly details including list of composed items, SKUs, and required quantities |
| `list_assemblies` | `eventTag` (optional string filter) | List all assemblies with event tags and component count |
| `update_assembly` | `assemblyId` (required UUID), `name` (opt), `description` (opt), `hint` (opt), `eventTypes` (opt), `itemQuantities` (optional map) | Update assembly metadata and/or replace component item bill of materials |
| `delete_assembly` | `assemblyId` (string UUID, required) | Delete an assembly and its component associations |

#### Event Operations (CRUD)
| Tool | Parameters | Description |
|---|---|---|
| `create_event` | `eventType` (required), `name` (required), `startDate` (required YYYY-MM-DD), `endDate` (opt YYYY-MM-DD), `status` (opt), `notes` (opt), `plannedQuantities` (opt map) | Create an airsoft event occurrence with planned equipment quotas |
| `get_event_details` | `eventId` (string UUID, required) | Retrieve event details, dates, status, notes, planned and used quantities |
| `list_events` | `status` (optional string filter, e.g. 'planned', 'active', 'completed') | List events with start/end dates and status |
| `update_event` | `eventId` (required UUID), `name` (opt), `eventType` (opt), `startDate` (opt), `endDate` (opt), `status` (opt), `notes` (opt), `plannedQuantities` (opt), `usedQuantities` (opt) | Update event schedule, status, notes, or planned/used quotas |
| `delete_event` | `eventId` (string UUID, required) | Delete an event occurrence (validates that no active orders are linked) |

#### Additional Inventory & Operational Tools
| Tool | Parameters | Description |
|---|---|---|
| `list_storage_locations` | `warehouseId` (optional UUID) | List all active warehouses, bins, staging areas, and map coordinates |
| `get_inventory_positions` | `itemId` (string UUID, required) | Get stock breakdown across locations (on-hand, reserved, available, in-transit, lot info) |
| `list_asset_instances` | `itemId` (optional UUID), `status` (optional string) | Query physical serialized assets (generators, tagged weapons, optics) with condition & custodian |
| `check_low_stock_items` | `threshold` (optional int buffer) | Identify catalog items below `min_stock` threshold |
| `get_operational_summary` | *none* | High-level metrics: total active items, serialized assets, locations, upcoming events, maintenance alerts |
| `get_maintenance_alerts` | *none* | Active maintenance and repair warnings for defective/overdue items and assets |

---

### Resources (`@Resource`)

Implemented in `org.ash.inventory.mcp.InventoryMcpResources`:

| Resource URI | Name | Description |
|---|---|---|
| `inventory://system/overview` | System Overview | System capabilities, aggregate boundaries, and domain architecture summary |
| `inventory://locations` | Storage Locations | JSON list of active storage locations, warehouse links, and types |
| `inventory://categories` | Catalog Categories | List of distinct item categories present in the active inventory |

---

### Prompts (`@Prompt`)

Implemented in `org.ash.inventory.mcp.InventoryMcpPrompts`:

| Prompt Name | Arguments | Description |
|---|---|---|
| `event_readiness_audit` | `eventName` (required string), `focusArea` (optional string) | Step-by-step audit prompt to evaluate equipment readiness and deficits for an upcoming event |
| `procurement_restock_plan` | `supplierPreference` (optional string) | Purchasing analysis prompt to formulate replenishment recommendations for items below threshold |

---

## Running and Verifying

1. Start Quarkus dev mode:
   ```bash
   cd backend
   mvn quarkus:dev
   ```
2. Run automated MCP test suite:
   ```bash
   cd backend
   mvn test -Dtest=InventoryMcpTest
   ```
