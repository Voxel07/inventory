package org.ash.inventory.resource;

import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.ash.inventory.resource.dto.PurchasingDtos;
import org.ash.inventory.service.PurchasingService;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class PurchasingResource {
    private final PurchasingService service;

    public PurchasingResource(PurchasingService service) {
        this.service = service;
    }

    @GET @Path("/vendors")
    public List<PurchasingDtos.VendorResponse> vendors(
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.vendors(page, size);
    }

    @POST @Path("/vendors")
    public Response createVendor(@Valid PurchasingDtos.VendorInput input) {
        var created = service.createVendor(input);
        return Response.created(URI.create("/api/vendors/" + created.id())).entity(created).build();
    }

    @PUT @Path("/vendors/{id}")
    public PurchasingDtos.VendorResponse updateVendor(@PathParam("id") UUID id,
            @Valid PurchasingDtos.VendorInput input) {
        return service.updateVendor(id, input);
    }

    @DELETE @Path("/vendors/{id}")
    public Response retireVendor(@PathParam("id") UUID id) {
        service.retireVendor(id);
        return Response.noContent().build();
    }

    @GET @Path("/purchase-orders")
    public List<PurchasingDtos.PurchaseOrderResponse> purchaseOrders(
            @QueryParam("status") String status,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.purchaseOrders(status, page, size);
    }

    @POST @Path("/purchase-orders")
    public Response createPurchaseOrder(@Valid PurchasingDtos.PurchaseOrderInput input) {
        var created = service.createPurchaseOrder(input);
        return Response.created(URI.create("/api/purchase-orders/" + created.id())).entity(created).build();
    }

    @PUT @Path("/purchase-orders/{id}")
    public PurchasingDtos.PurchaseOrderResponse updatePurchaseOrder(@PathParam("id") UUID id,
            @Valid PurchasingDtos.PurchaseOrderInput input) {
        return service.updatePurchaseOrder(id, input);
    }

    @POST @Path("/purchase-orders/{id}/transitions")
    public PurchasingDtos.PurchaseOrderResponse transitionPurchaseOrder(@PathParam("id") UUID id,
            @Valid PurchasingDtos.PurchaseOrderTransitionInput input) {
        return service.transitionPurchaseOrder(id, input);
    }

    @GET @Path("/goods-receipts")
    public List<PurchasingDtos.GoodsReceiptResponse> receipts(
            @QueryParam("purchaseOrderId") UUID purchaseOrderId,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.receipts(purchaseOrderId, page, size);
    }

    @POST @Path("/goods-receipts")
    public Response postReceipt(@Valid PurchasingDtos.GoodsReceiptInput input) {
        var created = service.postReceipt(input);
        return Response.created(URI.create("/api/goods-receipts/" + created.id())).entity(created).build();
    }

    @GET @Path("/vendor-documents")
    public List<PurchasingDtos.VendorDocumentResponse> documents(
            @QueryParam("vendorId") UUID vendorId,
            @QueryParam("purchaseOrderId") UUID purchaseOrderId,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return service.documents(vendorId, purchaseOrderId, page, size);
    }

    @POST @Path("/vendor-documents")
    public Response attachDocument(@Valid PurchasingDtos.VendorDocumentInput input) {
        var created = service.attachDocument(input);
        return Response.created(URI.create("/api/vendor-documents/" + created.id())).entity(created).build();
    }
}
