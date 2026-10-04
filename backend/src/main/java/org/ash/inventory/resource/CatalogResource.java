package org.ash.inventory.resource;

import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.service.ApiQueryService;
import org.ash.inventory.service.CatalogService;

import org.ash.inventory.resource.dto.ApiResponses;

import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CatalogResource {
    private final CatalogService service;
    private final CatalogResponseCache responses;
    private final ApiMapper mapper;
    private final ActorService actor;
    private final ApiQueryService queries;

    public CatalogResource(CatalogService service, CatalogResponseCache responses, ApiMapper mapper,
            ActorService actor, ApiQueryService queries) {
        this.service = service;
        this.responses = responses;
        this.mapper = mapper;
        this.actor = actor;
        this.queries = queries;
    }

    @GET @Path("/items")
    public List<ApiResponses.ItemResponse> items(@QueryParam("search") String search,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) {
        return queries.items(search, page, size);
    }

    @GET @Path("/items/{id}")
    public ApiResponses.ItemResponse item(@PathParam("id") UUID id) { return queries.item(id); }
    @POST @Path("/items") @Transactional public ApiResponses.ItemResponse createItem(@Valid ApiModels.ItemInput input) { return queries.projectItem(service.createItem(input)); }
    @PATCH @Path("/items/{id}") @Transactional public ApiResponses.ItemResponse updateItem(@PathParam("id") UUID id, @Valid ApiModels.ItemInput input) { return queries.projectItem(service.updateItem(id, input)); }
    @DELETE @Path("/items/{id}") @Transactional public Response deleteItem(@PathParam("id") UUID id) { service.retireItem(id); return Response.noContent().build(); }

    @GET @Path("/items/{id}/assets")
    public List<ApiResponses.AssetInstanceResponse> itemAssets(@PathParam("id") UUID id,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return queries.itemAssets(id, page, size);
    }

    @GET @Path("/assets/by-code/{code:.+}")
    public ApiResponses.AssetInstanceResponse assetByCode(@PathParam("code") String code) {
        return queries.assetByCode(code);
    }

    @POST @Path("/items/{id}/assets") @Transactional
    public List<ApiResponses.AssetInstanceResponse> createAssets(@PathParam("id") UUID id, @Valid ApiModels.AssetInstanceInput input) {
        actor.requireItemEdit(service.getVisibleItem(id));
        return mapper.assets(service.createAssets(id, input));
    }

    @PATCH @Path("/items/{id}/assets/{assetId}") @Transactional
    public ApiResponses.AssetInstanceResponse updateAsset(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId, @Valid ApiModels.AssetInstanceInput input) {
        actor.requireItemEdit(service.getVisibleItem(id));
        return mapper.asset(service.updateAsset(id, assetId, input));
    }

    @POST @Path("/items/{id}/assets/{assetId}/relocate") @Transactional
    public ApiResponses.AssetInstanceResponse relocateAsset(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId,
            @Valid ApiModels.AssetRelocationInput input) {
        actor.requireItemEdit(service.getVisibleItem(id));
        return mapper.asset(service.relocateAsset(id, assetId, input));
    }

    @POST @Path("/items/{id}/assets/{assetId}/condition") @Transactional
    public ApiResponses.AssetInstanceResponse updateAssetCondition(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId,
            @Valid ApiModels.AssetConditionInput input) {
        var item = service.getVisibleItem(id);
        if (item.accessPolicy == null) actor.requireMaintenance(); else actor.requireItemEdit(item);
        return mapper.asset(service.updateAssetCondition(id, assetId, input));
    }

    @DELETE @Path("/items/{id}/assets/{assetId}") @Transactional
    public Response deleteAsset(@PathParam("id") UUID id, @PathParam("assetId") UUID assetId) {
        var item = service.getVisibleItem(id);
        if (item.accessPolicy == null) actor.requireAdmin(); else actor.requireItemEdit(item);
        service.deleteAsset(id, assetId);
        return Response.noContent().build();
    }

    @GET @Path("/storage-locations") @Transactional
    public Response locations(@QueryParam("includeInactive") @DefaultValue("false") boolean includeInactive) {
        actor.current();
        if (includeInactive) return Response.ok(mapper.locations(service.getAllLocations())).build();
        return Response.ok(mapper.locations(service.getLocations())).build();
    }
    @GET @Path("/storage-locations/{id}")
    public ApiResponses.StorageLocationResponse location(@PathParam("id") UUID id) { return queries.location(id); }
    @POST @Path("/storage-locations") @Transactional public ApiResponses.StorageLocationResponse createLocation(@Valid ApiModels.StorageLocationInput input) { return mapper.location(service.createLocation(input)); }
    @PATCH @Path("/storage-locations/{id}") @Transactional public ApiResponses.StorageLocationResponse updateLocation(@PathParam("id") UUID id, @Valid ApiModels.StorageLocationInput input) { return mapper.location(service.updateLocation(id, input)); }
    @DELETE @Path("/storage-locations/{id}") @Transactional public Response deleteLocation(@PathParam("id") UUID id) { service.deleteLocation(id); return Response.noContent().build(); }

    @GET @Path("/assemblies")
    public List<ApiResponses.AssemblyResponse> assemblies() { return queries.assemblies(); }
    @GET @Path("/assemblies/{id}")
    public ApiResponses.AssemblyResponse assembly(@PathParam("id") UUID id) { return queries.assembly(id); }
    @POST @Path("/assemblies") @Transactional public ApiResponses.AssemblyResponse createAssembly(@Valid ApiModels.AssemblyInput input) { actor.requireManager(); return queries.projectAssembly(service.createAssembly(input)); }
    @PATCH @Path("/assemblies/{id}") @Transactional public ApiResponses.AssemblyResponse updateAssembly(@PathParam("id") UUID id, @Valid ApiModels.AssemblyInput input) { actor.requireManager(); return queries.projectAssembly(service.updateAssembly(id, input)); }
    @DELETE @Path("/assemblies/{id}") @Transactional public Response deleteAssembly(@PathParam("id") UUID id) { actor.requireManager(); service.deleteAssembly(id); return Response.noContent().build(); }

    @GET @Path("/events")
    public Response events(@QueryParam("eventType") String eventType) {
        actor.current();
        return catalogResponse(responses.events(cacheKey(eventType)));
    }
    @GET @Path("/events/{id}")
    public ApiResponses.EventResponse event(@PathParam("id") UUID id) { return queries.event(id); }
    @POST @Path("/events") @Transactional public ApiResponses.EventResponse createEvent(@Valid ApiModels.EventInput input) { actor.requirePlanner(); return queries.projectEvent(service.createEvent(input)); }
    @PATCH @Path("/events/{id}") @Transactional public ApiResponses.EventResponse updateEvent(@PathParam("id") UUID id, @Valid ApiModels.EventInput input) { actor.requirePlanner(); return queries.projectEvent(service.updateEvent(id, input)); }
    @DELETE @Path("/events/{id}") @Transactional public Response deleteEvent(@PathParam("id") UUID id) { actor.requirePlanner(); service.deleteEvent(id); return Response.noContent().build(); }

    @GET @Path("/factions")
    public Response factions(@QueryParam("eventType") String eventType) {
        actor.current();
        return catalogResponse(responses.factions(cacheKey(eventType)));
    }
    @POST @Path("/factions") @Transactional public ApiResponses.FactionResponse createFaction(@Valid ApiModels.FactionInput input) { actor.requirePlanner(); return mapper.faction(service.createFaction(input)); }

    private String cacheKey(String value) {
        return value == null ? "" : value;
    }

    private Response catalogResponse(String json) {
        return Response.ok(json, MediaType.APPLICATION_JSON_TYPE).build();
    }

}
