package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.ash.inventory.model.Assembly;
import org.ash.inventory.model.EventOccurrence;
import org.ash.inventory.model.Faction;
import org.ash.inventory.model.Item;
import org.ash.inventory.model.StorageLocation;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.CatalogOrm;
import org.ash.inventory.service.CatalogService;

import java.util.List;
import java.util.UUID;

@Path("/api")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class CatalogResource {
    @Inject CatalogService service;
    @Inject ApiMapper mapper;
    @Inject ActorService actor;
    @Inject CatalogOrm orm;

    @GET @Path("/items") @Transactional
    public List<?> items(@QueryParam("search") String search) {
        actor.current();
        List<Item> values = orm.items(search);
        return values.stream().map(mapper::item).toList();
    }

    @GET @Path("/items/{id}") @Transactional
    public Object item(@PathParam("id") UUID id) { actor.current(); return mapper.item(required(Item.class, id, "Item")); }
    @POST @Path("/items") public Object createItem(@Valid ApiModels.ItemInput input) { actor.requireManager(); return mapper.item(service.createItem(input)); }
    @PATCH @Path("/items/{id}") public Object updateItem(@PathParam("id") UUID id, @Valid ApiModels.ItemInput input) { actor.requireManager(); return mapper.item(service.updateItem(id, input)); }
    @DELETE @Path("/items/{id}") public Response deleteItem(@PathParam("id") UUID id) { actor.requireManager(); service.retireItem(id); return Response.noContent().build(); }

    @GET @Path("/storage-locations") @Transactional
    public List<?> locations() { actor.current(); return orm.locations().stream().map(mapper::location).toList(); }
    @GET @Path("/storage-locations/{id}") @Transactional
    public Object location(@PathParam("id") UUID id) { actor.current(); return mapper.location(required(StorageLocation.class, id, "Storage location")); }
    @POST @Path("/storage-locations") public Object createLocation(@Valid ApiModels.StorageLocationInput input) { actor.requireManager(); return mapper.location(service.createLocation(input)); }
    @PATCH @Path("/storage-locations/{id}") public Object updateLocation(@PathParam("id") UUID id, @Valid ApiModels.StorageLocationInput input) { actor.requireManager(); return mapper.location(service.updateLocation(id, input)); }
    @DELETE @Path("/storage-locations/{id}") public Response deleteLocation(@PathParam("id") UUID id) { actor.requireManager(); service.deleteLocation(id); return Response.noContent().build(); }

    @GET @Path("/assemblies") @Transactional
    public List<?> assemblies() { actor.current(); return orm.assemblies().stream().map(mapper::assembly).toList(); }
    @GET @Path("/assemblies/{id}") @Transactional
    public Object assembly(@PathParam("id") UUID id) { actor.current(); return mapper.assembly(required(Assembly.class, id, "Assembly")); }
    @POST @Path("/assemblies") public Object createAssembly(@Valid ApiModels.AssemblyInput input) { actor.requireManager(); return mapper.assembly(service.createAssembly(input)); }
    @PATCH @Path("/assemblies/{id}") public Object updateAssembly(@PathParam("id") UUID id, @Valid ApiModels.AssemblyInput input) { actor.requireManager(); return mapper.assembly(service.updateAssembly(id, input)); }
    @DELETE @Path("/assemblies/{id}") public Response deleteAssembly(@PathParam("id") UUID id) { actor.requireManager(); service.deleteAssembly(id); return Response.noContent().build(); }

    @GET @Path("/events") @Transactional
    public List<?> events(@QueryParam("eventType") String eventType) {
        actor.current();
        List<EventOccurrence> values = orm.events(eventType);
        return values.stream().map(mapper::event).toList();
    }
    @GET @Path("/events/{id}") @Transactional
    public Object event(@PathParam("id") UUID id) { actor.current(); return mapper.event(required(EventOccurrence.class, id, "Event occurrence")); }
    @POST @Path("/events") public Object createEvent(@Valid ApiModels.EventInput input) { actor.requireManager(); return mapper.event(service.createEvent(input)); }
    @PATCH @Path("/events/{id}") public Object updateEvent(@PathParam("id") UUID id, @Valid ApiModels.EventInput input) { actor.requireManager(); return mapper.event(service.updateEvent(id, input)); }

    @GET @Path("/factions") @Transactional
    public List<?> factions(@QueryParam("eventType") String eventType) {
        actor.current();
        List<Faction> values = orm.factions(eventType);
        return values.stream().map(mapper::faction).toList();
    }
    @POST @Path("/factions") public Object createFaction(@Valid ApiModels.FactionInput input) { actor.requireManager(); return mapper.faction(service.createFaction(input)); }

    private <T> T required(Class<T> type, UUID id, String label) {
        T value = orm.find(type, id);
        if (value == null) throw ApiException.notFound(label + " not found");
        return value;
    }
}
