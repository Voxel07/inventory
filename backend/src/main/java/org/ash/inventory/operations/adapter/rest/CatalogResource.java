package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.ApiQueryService;
import org.ash.inventory.operations.internal.application.CatalogService;
import org.ash.inventory.operations.internal.application.RuntimeService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.projection.ApiMapper;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.PageBounds;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CatalogResource {
    private final CatalogService service;
    private final CatalogResponses responses;
    private final ApiMapper mapper;
    private final ActorService actor;
    private final ApiQueryService queries;

    public CatalogResource(CatalogService service, CatalogResponses responses, ApiMapper mapper,
            ActorService actor, ApiQueryService queries) {
        this.service = service;
        this.responses = responses;
        this.mapper = mapper;
        this.actor = actor;
        this.queries = queries;
    }

    @Paged @GET @Path("/items")
    public List<ApiResponses.ItemResponse> items(@QueryParam("search") String search,
            @QueryParam("category") String category,
            @QueryParam("eventType") String eventType,
            @QueryParam("includeUntagged") @DefaultValue("false") boolean includeUntagged,
            @QueryParam("locationId") List<UUID> locationIds,
            @QueryParam("id") List<UUID> ids,
            @QueryParam("mine") @DefaultValue("false") boolean mine,
            @QueryParam("sort") String sort,
            @QueryParam("maintenanceAttention") @DefaultValue("false") boolean maintenanceAttention,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.items(search, category, eventType, includeUntagged, locationIds, ids, mine, sort, maintenanceAttention, page, size);
    }

    /** Overview metrics over the caller's visible inventory. */
    @GET @Path("/inventory-summary")
    public ApiResponses.InventorySummaryResponse inventorySummary() { return queries.summary(); }

    /** Distinct categories of the items visible to the caller, for filters without reading the catalog. */
    @GET @Path("/item-categories") @Transactional
    public List<String> itemCategories() { return service.getVisibleCategories(); }

    /** Names of the visible active items at one storage location (none: items without one), for the duplicate-name check. */
    @GET @Path("/item-names") @Transactional
    public List<String> itemNames(@QueryParam("storageLocation") UUID storageLocation) { return service.getVisibleItemNames(storageLocation); }

    @GET @Path("/items/{id}")
    public ApiResponses.ItemResponse item(@PathParam("id") UUID id) { return queries.item(id); }
    @Paged @GET @Path("/items/{id}/stock-history")
    public List<ApiResponses.StockHistoryResponse> stockHistory(@PathParam("id") UUID id,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return queries.stockHistory(id, page, size);
    }
    @GET @Path("/items/by-sku/{sku:.+}")
    public ApiResponses.ItemResponse itemBySku(@PathParam("sku") String sku) { return queries.itemBySku(sku); }
    @POST @Path("/items") @Transactional public ApiResponses.ItemResponse createItem(@Valid ApiModels.ItemInput input) { return queries.projectItem(service.createItem(input)); }
    /** Bulk create/update for imports: one request and one transaction per chunk of up to 100 rows. */
    @POST @Path("/items/batch") @Transactional
    public List<ApiResponses.ItemResponse> saveItems(@Valid @jakarta.validation.constraints.NotNull ApiModels.ItemBatchInput input) {
        return queries.projectItems(service.saveItems(input.items()));
    }
    @PATCH @Path("/items/{id}") @Transactional public ApiResponses.ItemResponse updateItem(@PathParam("id") UUID id, @Valid ApiModels.ItemInput input) { return queries.projectItem(service.updateItem(id, input)); }
    @DELETE @Path("/items/{id}") @Transactional public Response deleteItem(@PathParam("id") UUID id) { service.retireItem(id); return Response.noContent().build(); }

    @Paged @GET @Path("/items/{id}/assets")
    public List<ApiResponses.AssetInstanceResponse> itemAssets(@PathParam("id") UUID id,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return queries.itemAssets(id, page, size);
    }

    @GET @Path("/assets/by-code/{code:.+}")
    public ApiResponses.AssetInstanceResponse assetByCode(@PathParam("code") String code) {
        return queries.assetByCode(code);
    }

    @POST @Path("/items/{id}/assets") @Transactional
    public ApiResponses.AssetInstanceResponse createAsset(@PathParam("id") UUID id, @Valid ApiModels.AssetInstanceInput input) {
        return mapper.asset(service.createAsset(id, input));
    }

    @PATCH @Path("/items/{id}/assets/{assetId}") @Transactional
    public ApiResponses.AssetInstanceResponse updateAsset(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId, @Valid ApiModels.AssetInstanceInput input) {
        return mapper.asset(service.updateAsset(id, assetId, input));
    }

    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.RuntimeService runtime;

    @POST @Path("/items/{id}/assets/{assetId}/runtime") @Transactional
    public ApiResponses.RuntimeEntryResponse logRuntime(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId,
            @Valid ApiModels.RuntimeInput input) {
        return mapper.runtime(runtime.log(id, assetId, input));
    }

    @Paged @GET @Path("/items/{id}/assets/{assetId}/runtime") @Transactional
    public List<ApiResponses.RuntimeEntryResponse> assetRuntime(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return runtime.forAsset(id, assetId, page, size).stream().map(mapper::runtime).toList();
    }

    @Paged @GET @Path("/items/{id}/runtime") @Transactional
    public List<ApiResponses.RuntimeEntryResponse> itemRuntime(@PathParam("id") UUID id,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return runtime.forItem(id, page, size).stream().map(mapper::runtime).toList();
    }

    @POST @Path("/items/{id}/assets/{assetId}/relocate") @Transactional
    public ApiResponses.AssetInstanceResponse relocateAsset(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId,
            @Valid ApiModels.AssetRelocationInput input) {
        return mapper.asset(service.relocateAsset(id, assetId, input));
    }

    @POST @Path("/items/{id}/assets/{assetId}/condition") @Transactional
    public ApiResponses.AssetInstanceResponse updateAssetCondition(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId,
            @Valid ApiModels.AssetConditionInput input) {
        return mapper.asset(service.updateAssetCondition(id, assetId, input));
    }

    @DELETE @Path("/items/{id}/assets/{assetId}") @Transactional
    public Response deleteAsset(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId) {
        service.deleteAsset(id, assetId);
        return Response.noContent().build();
    }

    /** Re-codes existing units; no units are created, so stock is unchanged. */
    @POST @Path("/items/{id}/assets/recode") @Transactional
    public List<ApiResponses.AssetInstanceResponse> recodeAssets(@PathParam("id") UUID id, @Valid ApiModels.AssetRecodeInput input) {
        return mapper.assets(service.recodeAssets(id, input));
    }

    /** Writes off several units at once; all or nothing. */
    @POST @Path("/items/{id}/assets/write-off") @Transactional
    public Response writeOffAssets(@PathParam("id") UUID id, @Valid ApiModels.AssetIdsInput input) {
        service.writeOffAssets(id, input.assetIds());
        return Response.noContent().build();
    }

    @Paged @GET @Path("/storage-locations") @Transactional
    public List<ApiResponses.StorageLocationResponse> locations(@QueryParam("includeInactive") @DefaultValue("false") boolean includeInactive,
            @QueryParam("search") String search, @QueryParam("subtreeId") UUID subtreeId,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        var bounds = org.ash.inventory.platform.api.PageBounds.of(page, size);
        return mapper.locations(service.getLocations(includeInactive, search, subtreeId, bounds.offset(), bounds.limit()));
    }
    @GET @Path("/storage-locations/{id}")
    public ApiResponses.StorageLocationResponse location(@PathParam("id") UUID id) { return queries.location(id); }
    @POST @Path("/storage-locations") @Transactional public ApiResponses.StorageLocationResponse createLocation(@Valid ApiModels.StorageLocationInput input) { return mapper.location(service.createLocation(input)); }
    @PATCH @Path("/storage-locations/{id}") @Transactional public ApiResponses.StorageLocationResponse updateLocation(@PathParam("id") UUID id, @Valid ApiModels.StorageLocationInput input) { return mapper.location(service.updateLocation(id, input)); }
    /** Creates or extends a top-level location with its sections and storage places; returns the whole location tree. */
    @PUT @Path("/storage-locations/structure") @Transactional
    public List<ApiResponses.StorageLocationResponse> saveStructure(@Valid ApiModels.StorageStructureInput input) { return mapper.locations(service.saveStructure(input)); }
    @DELETE @Path("/storage-locations/{id}") @Transactional public Response deleteLocation(@PathParam("id") UUID id) { service.deleteLocation(id); return Response.noContent().build(); }

    @Paged @GET @Path("/assemblies")
    public List<ApiResponses.AssemblyResponse> assemblies(@QueryParam("search") String search,
            @QueryParam("mine") @DefaultValue("false") boolean mine,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return queries.assemblies(search, null, mine, page, size);
    }
    @GET @Path("/assemblies/{id}")
    public ApiResponses.AssemblyResponse assembly(@PathParam("id") UUID id) { return queries.assembly(id); }
    @POST @Path("/assemblies") @Transactional public ApiResponses.AssemblyResponse createAssembly(@Valid ApiModels.AssemblyInput input) { return queries.projectAssembly(service.createAssembly(input)); }
    @PATCH @Path("/assemblies/{id}") @Transactional public ApiResponses.AssemblyResponse updateAssembly(@PathParam("id") UUID id, @Valid ApiModels.AssemblyInput input) { return queries.projectAssembly(service.updateAssembly(id, input)); }
    @DELETE @Path("/assemblies/{id}") @Transactional public Response deleteAssembly(@PathParam("id") UUID id) { service.retireAssembly(id); return Response.noContent().build(); }

    @Paged @GET @Path("/events")
    public List<ApiResponses.EventResponse> events(@QueryParam("eventType") String eventType,
            @QueryParam("status") String status, @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.events(eventType, status, page, size);
    }
    @GET @Path("/events/{id}")
    public ApiResponses.EventResponse event(@PathParam("id") UUID id) { return queries.event(id); }
    @POST @Path("/events") @Transactional public ApiResponses.EventResponse createEvent(@Valid ApiModels.EventInput input) { return queries.projectEvent(service.createEvent(input)); }
    @PATCH @Path("/events/{id}") @Transactional public ApiResponses.EventResponse updateEvent(@PathParam("id") UUID id, @Valid ApiModels.EventInput input) { return queries.projectEvent(service.updateEvent(id, input)); }
    @DELETE @Path("/events/{id}") @Transactional public Response deleteEvent(@PathParam("id") UUID id) { service.deleteEvent(id); return Response.noContent().build(); }

    @GET @Path("/event-types")
    public List<String> eventTypes() { return service.eventTypes(); }

    @GET @Path("/factions")
    public Response factions(@QueryParam("eventType") String eventType,
            @jakarta.ws.rs.HeaderParam("If-None-Match") String ifNoneMatch) {
        actor.current();
        String etag = responses.factionsEtag(cacheKey(eventType));
        if (etag.equals(ifNoneMatch)) return Response.notModified().header("ETag", etag).build();
        return Response.ok(responses.factions(cacheKey(eventType)), MediaType.APPLICATION_JSON_TYPE).header("ETag", etag).build();
    }
    @POST @Path("/factions") @Transactional public ApiResponses.FactionResponse createFaction(@Valid ApiModels.FactionInput input) { return mapper.faction(service.createFaction(input)); }

    private String cacheKey(String value) {
        return value == null ? "" : value;
    }

    private Response catalogResponse(String json) {
        return Response.ok(json, MediaType.APPLICATION_JSON_TYPE).build();
    }

}
