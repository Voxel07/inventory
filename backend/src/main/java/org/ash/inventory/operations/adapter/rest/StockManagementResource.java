package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.EquipmentPolicy;
import org.ash.inventory.operations.internal.application.PositionService;
import org.ash.inventory.operations.internal.application.StockManagementService;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.contract.dto.StockDtos;
import org.ash.inventory.operations.internal.model.InventoryLot;
import org.ash.inventory.operations.internal.model.InventoryPosition;
import org.ash.inventory.operations.internal.model.Item;
import org.ash.inventory.operations.internal.projection.ApiMapper;

import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class StockManagementResource {
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.PositionService positions;
    @jakarta.inject.Inject ApiMapper mapper;
    private final StockManagementService service;

    public StockManagementResource(StockManagementService service) { this.service = service; }

    @Paged @GET @Path("/inventory-lots") @jakarta.transaction.Transactional
    public List<StockDtos.LotResponse> lots(@QueryParam("itemId") UUID itemId,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return lots(service.lots(itemId, page, size));
    }

    @POST @Path("/inventory-lots") @jakarta.transaction.Transactional
    public Response createLot(@Valid StockDtos.LotCreateInput input) {
        var value = service.createLot(input);
        return Response.created(URI.create("/api/inventory-lots/" + value.id)).entity(lots(List.of(value)).getFirst()).build();
    }

    @PUT @Path("/inventory-lots/{id}") @jakarta.transaction.Transactional
    public StockDtos.LotResponse updateLot(@PathParam("id") UUID id, @Valid StockDtos.LotUpdateInput input) {
        return lots(List.of(service.updateLot(id, input))).getFirst();
    }

    @Paged @GET @Path("/inventory-assets") @jakarta.transaction.Transactional
    public List<org.ash.inventory.operations.internal.contract.dto.ApiResponses.AssetInstanceResponse> assets(@QueryParam("itemId") UUID itemId,
            @QueryParam("locationId") UUID locationId, @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return mapper.assets(service.assets(itemId, locationId, page, size));
    }

    @Paged @GET @Path("/inventory-positions") @jakarta.transaction.Transactional
    public List<StockDtos.PositionResponse> positions(@QueryParam("itemId") UUID itemId,
            @QueryParam("locationId") UUID locationId, @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        var page_ = service.positions(itemId, locationId, page, size);
        // One batched reservation read for the page instead of one per position.
        var reserved = reservations(page_.stream().map(position -> position.item).distinct().toList());
        return page_.stream().map(position -> position(position, reserved.getOrDefault(position.id, 0))).toList();
    }

    /** FEFO reservation share per position of the given items, from their complete ordered positions. */
    private java.util.Map<UUID, Integer> reservations(List<org.ash.inventory.operations.internal.model.Item> items) {
        // Each item's positions keep the query's FEFO order; shares are allocated per item and location.
        var ordered = positions.load(items.stream().map(item -> item.id).toList()).values().stream().flatMap(List::stream).toList();
        return positions.reservedAt(items, ordered);
    }

    private List<StockDtos.LotResponse> lots(List<InventoryLot> values) {
        if (values.isEmpty()) return List.of();
        var items = values.stream().map(lot -> lot.item).distinct().toList();
        var reserved = reservations(items);
        var byLot = new java.util.HashMap<UUID, List<InventoryPosition>>();
        positions.load(items.stream().map(item -> item.id).toList()).values().stream().flatMap(List::stream)
                .filter(position -> position.lot != null).forEach(position -> byLot.computeIfAbsent(position.lot.id, ignored -> new java.util.ArrayList<>()).add(position));
        return values.stream().map(value -> lot(value, byLot.getOrDefault(value.id, List.of()), reserved)).toList();
    }

    private StockDtos.LotResponse lot(InventoryLot value, List<InventoryPosition> held, java.util.Map<UUID, Integer> reserved) {
        var stock = held.stream().filter(p -> p.quantityOnHand > 0 || p.quantityInTransit > 0).map(p -> {
            int share = reserved.getOrDefault(p.id, 0);
            return new StockDtos.LotStock(p.location.id, p.location.name, p.quantityOnHand, Math.max(0, p.availableQuantity() - share), share,
                    p.quantityDamaged, p.quantityQuarantined, p.quantityInTransit);
        }).toList();
        return new StockDtos.LotResponse(value.id, value.item.id, value.item.name, value.item.sku, value.item.active,
                value.lotNumber, value.supplierLot, value.manufactureDate, value.expiryDate, value.bestBeforeDate,
                value.storageRequirements, value.status.name(), value.notes, value.createdAt, value.updatedAt, stock, stock.isEmpty());
    }

    private StockDtos.PositionResponse position(InventoryPosition value, int reserved) {
        return new StockDtos.PositionResponse(value.id, value.item.id, value.item.name, value.location.id,
                value.lot == null ? null : value.lot.id, value.quantityOnHand, reserved,
                value.quantityDamaged, value.quantityQuarantined, value.quantityInTransit,
                org.ash.inventory.operations.internal.application.EquipmentPolicy.freelyAvailable(value.item) ? Math.max(0, value.availableQuantity() - reserved) : 0,
                Math.max(0, value.availableQuantity() - reserved), value.lastCountedAt, value.version);
    }
}
