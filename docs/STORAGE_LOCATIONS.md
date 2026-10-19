# Storage locations

Storage is one tree with three roles. The role comes from the depth of a node, not from a type field.

| Depth | Role | Examples | Holds stock |
|---|---|---|---|
| 0 | **Location** (site) | Betriebshof, Garage - Matze | No, it only groups sections |
| 1 | **Section** | Container Elektronik, Büro 1, Garage Stellplatz 3, Oben | Yes, directly (e.g. a pallet on the floor), or in its storage places |
| 2+ | **Storage place** | Regal 2 → Fach 7 | Yes; places nest (shelf → compartment → box) |

```text
Betriebshof (BH)                 location, no stock
├─ Container Elektronik (CE)     section
│  ├─ Regal 1 (R1)               storage place
│  │  ├─ Fach 1 (F1)             BH-CE-R1-F1
│  │  └─ Fach 2 (F2)
│  └─ Regal 2 (R2)
├─ Garage Stellplatz 3 (GS3)     section, stock on the floor is fine
└─ Büro 1 (B1)
Garage - Matze (private)         same model for tenants and members
└─ Oben → Regal 1 → Fach 1
```

## Rules

- **No stock in a location.** Item home and return locations, positions, assets, receipts, transfers and pickup points must be a section or a storage place (`LocationHierarchyService.requireStockLocation`). A node can only become top-level while it holds nothing.
- **Codes.** Each level has a short code that is unique among the siblings its editor can see; it is derived from the name (`Regal 3` → `R3`) unless one is given. A rename keeps the existing code. `fullCode` joins the codes from the location down (`BH-CE-R2-F7`). Labels and CSV import accept the full code, the path (`Betriebshof / Lager / Regal 3`) or a unique name.
- **Privacy.** A location (site) is public (staff) or private (owner). Everything inside a private location is private. Shares of a location apply to everything below it and to the items stored there.
- **Map.** Locations and sections keep coordinates and a floor-plan overlay. Storage places show the map of their nearest section or location.
- **Retirement.** Locations are deactivated, never deleted. Children have to be deactivated first.
- **Filters.** A location used as a filter (items, counts, reports, MCP `list_storage_locations`) covers its whole subtree.

## Flow

1. **New storage location** (one button) opens the structure dialog. Type a name: a known location loads its existing structure; an unknown name creates a new one.
2. Add sections, then storage places inside them, one by one or with **Generate** (e.g. `Regal` 1–4, each with `Fach` 1–8). Sections may stay empty.
3. **Save** sends everything in one request: `PUT /api/storage-locations/structure` (MCP: `save_storage_structure`). Nodes with an id are renamed in place, nodes without one are created, and nodes that are left out stay untouched.
4. The list shows **Grouped** (tree per location) or **Flat** (all nodes, paged, optionally limited to one location). The detail panel offers **Edit structure** / **Add storage places**, **Print labels** (QR sheet for every active section and place below, `/storage-locations/:id/labels`), edit (rename, move, map) and deactivate.

## Comparison with common inventory systems

| System | Structure | Taken over |
|---|---|---|
| Odoo | Warehouse → nested locations; "view" locations cannot hold stock; full name `WH/Stock/Shelf 1` | Top-level location as a structural node; full path and code |
| InvenTree | Free tree with a `structural` flag and location types | Role from depth instead of a free type list |
| SAP EWM / WMS | Site → zone → aisle → rack → level → bin; bulk bin generation; codes such as `A-01-03-B` | Bulk generator; short sibling-unique codes |
| Sortly, Homebox, Snipe-IT | Freely nested folders or locations | Unlimited nesting below a section |

The separate organization-only *warehouse* entity was merged into the top-level location, so organization staff and tenants use the same model.

## Not covered yet

- Capacity, dimensions and occupancy; a "find a free place" view
- Putaway rules (category → default place) beyond the item's home location
- Street address and photos on a location
- Movable sections (a container or vehicle that travels to an event). Moving the section is possible today, but there is no dedicated flow.
- Virtual locations (transit, quarantine, repair, scrap) are intentionally absent: asset and stock states model them.
