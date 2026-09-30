# MCP integration

The Quarkus backend exposes 21 tools, three resources and two prompts through `io.quarkiverse.mcp:quarkus-mcp-server-http:2.0.1`. Streamable HTTP uses `/mcp`; the extension also provides its legacy SSE transport below `/mcp/*`.

The 1 October 2026 implementation replaces the direct MCP database writers and readers identified as R01/R02 in the [repository review](REPOSITORY_REVIEW.md). `InventoryMcpTools` handles arguments and tool errors; `McpInventoryService` completes authorized, transactional use cases through `CatalogService`, `ApiQueryService`, `InventoryOperationsService`, `PositionService` and existing ORM readers. Resources and prompts also resolve the canonical actor. No MCP entity is serialized as a response.

## Authentication and authorization

Production authenticates both `/mcp` and `/mcp/*` at the Quarkus HTTP layer, including initialization, discovery, resource reads, tool calls and session management. Supply a valid OIDC bearer access token on **every request**, including SSE requests. The shared OIDC audience check requires the configured backend client ID; distinct SPA/API clients need the Authentik audience mapping described in `.env.example`. Protected resource metadata is enabled for OAuth discovery.

```properties
%prod.quarkus.http.auth.permission.mcp.paths=/mcp,/mcp/*
%prod.quarkus.http.auth.permission.mcp.policy=authenticated
quarkus.oidc.token.audience=${quarkus.oidc.client-id}
quarkus.oidc.resource-metadata.enabled=true
quarkus.mcp.server.http.root-path=/mcp
```

This follows the extension's [HTTP security guidance](https://docs.quarkiverse.io/quarkus-mcp-server/2.0.x/reference-security.html). OIDC must be enabled and configured in production. An MCP session ID does not replace bearer authentication. Development actor headers do not satisfy production HTTP authentication.

| Capability | Required access |
|---|---|
| Item and assembly create/update/delete | HQ administrator or warehouse crew, using `ActorService.requireManager()` |
| Event create/update/delete | HQ administrator or event planner, using `ActorService.requirePlanner()` |
| Item, stock, asset, category and operational reads | Authenticated actor; active item visibility follows manager/global/event/person/group rules |
| Assembly reads | Every component must be active and visible; otherwise the assembly is omitted or returns not found |
| Event reads | Authenticated actor; item IDs, names and all per-item quantity maps are filtered to visible active items |
| Locations, static overview and prompts | Authenticated actor; locations and event metadata are shared catalog information |

Actor identity and role are resolved for each invocation. Authenticated OIDC identity takes precedence over development headers. With explicitly enabled development authentication, REST and MCP use the same `X-Actor-Id`, `X-Actor-Name` and `X-Actor-Role` headers; direct CDI calls use the existing development default. `ActorService` reads the shared Vert.x request rather than a JAX-RS-only header context.

CORS accepts only configured `CORS_ORIGINS`. The allowed headers include `Authorization`, `Mcp-Session-Id`, `MCP-Protocol-Version` and `Last-Event-ID`; `Mcp-Session-Id` is exposed to browser clients. Configure the actual trusted browser origin when using an inspector. Publish the backend `/mcp` route through your API reverse proxy; the frontend static nginx server does not proxy API routes.

## Client connection

Use the backend origin, for example `https://inventory-api.example.com/mcp`, and configure your client's HTTP bearer authorization facility. Send:

```http
Authorization: Bearer <OIDC access token>
Accept: application/json, text/event-stream
Content-Type: application/json
```

For a stateful Streamable HTTP session, initialize, send `notifications/initialized`, then include the returned `Mcp-Session-Id` and negotiated `MCP-Protocol-Version` on subsequent requests. Never use a session created by another user. Token acquisition/refresh belongs to the client and configured identity provider.

## Tool contracts

Create/update tools accept a required nested `input` object using the explicit REST records in [ApiModels.java](../backend/src/main/java/org/ash/inventory/resource/ApiModels.java). Item, assembly, event, location and asset responses use [ApiResponses.java](../backend/src/main/java/org/ash/inventory/resource/dto/ApiResponses.java). MCP stock positions, alerts, summaries and delete results have explicit records in [InventoryMcpDtos.java](../backend/src/main/java/org/ash/inventory/mcp/InventoryMcpDtos.java).

This replaces the old individual create/update parameters and MCP-specific catalog DTOs. `delete_item` accepts only `itemId` and retires the item. `list_asset_instances` requires `itemId`. Clients should refresh `tools/list` and use the current schemas.

| Tool | Arguments | Behavior |
|---|---|---|
| `create_item` | `input: ItemInput` | Requires name/category; optional amount initializes the canonical ledger and bulk/serialized stock |
| `get_item_details` | `itemId` | Active, visible item with canonical stock and metadata |
| `search_items` | Optional `query`, `category`, `limit`, `page` | Name/SKU/category search; exact category filter applied before pagination; page defaults to 0, limit to 20, maximum 100 |
| `update_item` | `itemId`, `input: ItemInput` | Uses REST metadata update semantics; name/category required; supply current visibility and assignments to retain them |
| `delete_item` | `itemId` | Retires while preserving history; subsequent active reads return not found |
| `create_assembly` | `input: AssemblyInput` | Requires name and nonempty `itemQuantities` map of item UUIDs to positive integers |
| `get_assembly_details` | `assemblyId` | Authorized detail including component projection |
| `list_assemblies` | Optional `eventTag` | Scoped assemblies filtered by event tag; components projected in a batch |
| `update_assembly` | `assemblyId`, `input: AssemblyInput` | Replaces metadata/composition with REST semantics |
| `delete_assembly` | `assemblyId` | Shared catalog deletion command |
| `create_event` | `input: EventInput` | Requires eventType/startDate; supplied item quota IDs must be visible |
| `get_event_details` | `eventId` | Canonical historical deployment metrics with scoped item maps |
| `list_events` | Optional `status` | First 50 matching events in start-date order; scoped item maps |
| `update_event` | `eventId`, `input: EventInput` | Requires eventType/startDate; null quota maps retain existing values, supplied maps replace them |
| `delete_event` | `eventId` | Shared guard rejects linked faction, general or purchase orders |
| `list_storage_locations` | Optional `warehouseId` | Active locations with warehouse metadata |
| `get_inventory_positions` | `itemId` | Bulk/lot positions with FEFO command reservations, damage/quarantine and policy holds; serialized items return an empty list |
| `list_asset_instances` | `itemId`; optional `status`, `page`, `limit` | Visible item's active assets; typed availability-state filter applied before pagination; default limit 20, maximum 100 |
| `check_low_stock_items` | Optional nonnegative `threshold` | Visible items with availability ≤ minStock + buffer; deficit = max(0, minStock − available) |
| `get_operational_summary` | None | Visible active item/asset and maintenance-alert counts; shared active locations and upcoming non-cancelled events |
| `get_maintenance_alerts` | None | Visible item/asset flags and active calendar/hours/usage schedules, including unknown evidence |

`ItemInput.value` uses decimal currency units; location/assignment identifiers are UUIDs and dates use ISO format. Creation supports unlocated bulk stock without inventing a null-location position. Serialized creation produces assets and no bulk positions. Existing stock cannot be edited through `update_item`; use the existing stock-command API. Metadata updates follow REST defaults/null handling rather than partial MCP patch rules. Image ownership and item tracking guards remain in the catalog service.

`EventInput.usedQuantities` is the shared catalog field, but returned `usedQuantities` comes from historical handovers through `EventMetricsService`; writing that catalog field does not create custody or stock movement.

Example `tools/call` parameters:

```json
{
  "name": "create_item",
  "arguments": {
    "input": {
      "name": "Field radio",
      "category": "Communications",
      "trackingMode": "serialized",
      "amount": 4,
      "minStock": 2,
      "value": 125.50
    }
  }
}
```

Catalog mutations share locks, validation, media handling and `catalog.changed` outbox publication with REST. Initial stock transactions belong to the actual calling actor. There is no MCP system administrator account. Domain errors are translated into MCP tool errors with the domain status and safe message after the service transaction exits; rejected commands roll back.

Low-stock and maintenance/summary datasets use batch stock/policy facts, including assets, ledger totals, reservations and schedules. Item availability follows existing equipment consent, contributor-damage and maintenance decisions. Position availability shows unrestricted organization stock, preserves location/lot allocation and blocks the entire pool when required. Shared PositionOrm readers include remaining partially released reservations. Event-specific or commitment-required equipment must use the existing planning/lending workflows for its supply. Aggregate operations still scan the visible catalog; no runtime SQL-count or latency improvement is asserted.

## Resources and prompts

| Resource | Content |
|---|---|
| `inventory://system/overview` | Static system capabilities, after actor authentication |
| `inventory://locations` | Active shared location DTOs as JSON |
| `inventory://categories` | Distinct categories of active items visible to the caller |

| Prompt | Arguments |
|---|---|
| `event_readiness_audit` | Required `eventName`, optional `focusArea` |
| `procurement_restock_plan` | Optional `supplierPreference` |

Prompt templates authenticate the actor and contain no implicit write authorization. Any suggested tool invocation is subject to its own role and scope checks.

## Verification status

The existing `InventoryMcpTest` was updated for the shared payloads and targeted regression cases: role changes on the same session, person/group and private item/asset/position/assembly/category/event reads, actual actor/outbox evidence, serialized and unlocated stock, purchase-linked deletion, prepared/partially released reservations, contributor holds, validation rollback and schedule holds. `InventoryMcpAuthenticationTest` enables the production-equivalent MCP path policy with development authentication disabled and covers anonymous root/subpath requests and spoofed actor headers.

Only static verification was performed for this change: Java source parsing, local extension API inspection, contract/call-site checks, MCP persistence-boundary checks and whitespace/document-link checks. Per [agent.md](../agent.md), no compilation, builds or test suites were run. The regression cases are authored, not passing evidence. Production OIDC token/audience validation, expired-token denial, SSE authorization, connected SSE/ETag refresh and measured SQL counts remain runtime acceptance work.
