package org.ash.inventory.resource;

import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.ash.inventory.model.InventoryCode;
import org.ash.inventory.model.InventoryLot;
import org.ash.inventory.model.InventoryPosition;
import org.ash.inventory.model.Warehouse;
import org.ash.inventory.resource.dto.StockDtos;
import org.ash.inventory.service.StockManagementService;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class StockManagementResource {
    private final StockManagementService service;

    public StockManagementResource(StockManagementService service) { this.service = service; }

    @GET @Path("/warehouses")
    public List<StockDtos.WarehouseResponse> warehouses(@QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.warehouses(page, size).stream().map(this::warehouse).toList();
    }

    @POST @Path("/warehouses")
    public Response createWarehouse(@Valid StockDtos.WarehouseInput input) {
        var value = service.createWarehouse(input);
        return Response.created(URI.create("/api/warehouses/" + value.id)).entity(warehouse(value)).build();
    }

    @PUT @Path("/warehouses/{id}")
    public StockDtos.WarehouseResponse updateWarehouse(@PathParam("id") UUID id, @Valid StockDtos.WarehouseInput input) {
        return warehouse(service.updateWarehouse(id, input));
    }

    @DELETE @Path("/warehouses/{id}")
    public Response retireWarehouse(@PathParam("id") UUID id) { service.retireWarehouse(id); return Response.noContent().build(); }

    @GET @Path("/inventory-codes")
    public List<StockDtos.InventoryCodeResponse> codes(@QueryParam("targetId") UUID targetId,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return service.codes(targetId, page, size).stream().map(this::code).toList();
    }

    @GET @Path("/inventory-codes/resolve/{code:.+}")
    public StockDtos.CodeResolutionResponse resolveCode(@PathParam("code") String value) {
        var code = service.resolveCode(value);
        return new StockDtos.CodeResolutionResponse(code.code, code.targetType.name(), code.targetId);
    }

    @POST @Path("/inventory-codes")
    public Response createCode(@Valid StockDtos.InventoryCodeInput input) {
        var value = service.createCode(input);
        return Response.created(URI.create("/api/inventory-codes/" + value.id)).entity(code(value)).build();
    }

    @PUT @Path("/inventory-codes/{id}")
    public StockDtos.InventoryCodeResponse updateCode(@PathParam("id") UUID id, @Valid StockDtos.InventoryCodeInput input) {
        return code(service.updateCode(id, input));
    }

    @DELETE @Path("/inventory-codes/{id}")
    public Response retireCode(@PathParam("id") UUID id) { service.retireCode(id); return Response.noContent().build(); }

    @GET @Path("/inventory-lots")
    public List<StockDtos.LotResponse> lots(@QueryParam("itemId") UUID itemId,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return service.lots(itemId, page, size).stream().map(this::lot).toList();
    }

    @POST @Path("/inventory-lots")
    public Response createLot(@Valid StockDtos.LotInput input) {
        var value = service.createLot(input);
        return Response.created(URI.create("/api/inventory-lots/" + value.id)).entity(lot(value)).build();
    }

    @PUT @Path("/inventory-lots/{id}")
    public StockDtos.LotResponse updateLot(@PathParam("id") UUID id, @Valid StockDtos.LotInput input) {
        return lot(service.updateLot(id, input));
    }

    @GET @Path("/inventory-positions")
    public List<StockDtos.PositionResponse> positions(@QueryParam("itemId") UUID itemId,
            @QueryParam("locationId") UUID locationId, @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.positions(itemId, locationId, page, size).stream().map(this::position).toList();
    }

    private StockDtos.WarehouseResponse warehouse(Warehouse value) {
        return new StockDtos.WarehouseResponse(value.id, value.createdAt, value.updatedAt, value.code,
                value.name, value.description, value.active);
    }

    private StockDtos.InventoryCodeResponse code(InventoryCode value) {
        return new StockDtos.InventoryCodeResponse(value.id, value.code, value.targetType.name(), value.targetId,
                value.primaryCode, value.active, value.retiredAt);
    }

    private StockDtos.LotResponse lot(InventoryLot value) {
        return new StockDtos.LotResponse(value.id, value.item.id, value.lotNumber, value.supplierLot,
                value.manufactureDate, value.expiryDate, value.bestBeforeDate, value.storageRequirements,
                value.status.name(), value.notes, value.createdAt, value.updatedAt);
    }

    private StockDtos.PositionResponse position(InventoryPosition value) {
        return new StockDtos.PositionResponse(value.id, value.item.id, value.location.id,
                value.lot == null ? null : value.lot.id, value.quantityOnHand, value.quantityReserved,
                value.quantityDamaged, value.quantityQuarantined, value.quantityInTransit,
                value.availableQuantity(), value.lastCountedAt, value.version);
    }
}
