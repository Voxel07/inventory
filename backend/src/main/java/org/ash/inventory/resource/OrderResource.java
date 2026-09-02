package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.model.FactionOrder;
import org.ash.inventory.model.UserAccount;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.OrderOrm;
import org.ash.inventory.service.OrderService;

import java.util.List;
import java.util.UUID;

@Path("/api/orders")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class OrderResource {
    @Inject OrderService service;
    @Inject ApiMapper mapper;
    @Inject ActorService actor;
    @Inject OrderOrm orm;

    @GET @Transactional
    public List<?> orders(@QueryParam("eventType") String eventType, @QueryParam("faction") String faction) {
        UserAccount user = actor.current();
        var stream = orm.orders(eventType, faction).stream();
        if (user.role == DomainEnums.UserRole.faction_leader) stream = stream.filter(value -> user.factions.contains(value.faction.name) || user.factions.contains(value.faction.eventType + ":" + value.faction.name));
        return stream.map(mapper::order).toList();
    }

    @GET @Path("/{id}") @Transactional
    public Object order(@PathParam("id") UUID id) {
        var order = orm.findOrder(id);
        if (order == null) throw ApiException.notFound("Faction order not found");
        service.assertCanView(order);
        return mapper.order(order);
    }

    @POST public Object create(@Valid ApiModels.OrderInput input) { actor.current(); return mapper.order(service.create(input)); }
    @PATCH @Path("/{id}") public Object update(@PathParam("id") UUID id, @Valid ApiModels.OrderInput input) { actor.current(); return mapper.order(service.update(id, input)); }
    @POST @Path("/{id}/prepare") public Object prepare(@PathParam("id") UUID id, @Valid ApiModels.PreparationInput input) { actor.requireManager(); return mapper.order(service.prepare(id, input)); }
    @POST @Path("/{id}/transitions/{status}")
    public Object transition(@PathParam("id") UUID id, @PathParam("status") DomainEnums.OrderStatus status, ApiModels.TransitionInput input) {
        if (status == DomainEnums.OrderStatus.submitted || status == DomainEnums.OrderStatus.draft) actor.current();
        else actor.requireManager();
        var safeInput = input == null ? new ApiModels.TransitionInput(null, null, null) : input;
        return mapper.order(service.transition(id, status, safeInput));
    }
    @POST @Path("/{id}/return") public Object returnItems(@PathParam("id") UUID id, @Valid ApiModels.ReturnInput input) { actor.requireManager(); return mapper.order(service.returnItems(id, input)); }
    @POST @Path("/{id}/return-all") public Object returnAll(@PathParam("id") UUID id, ApiModels.TransitionInput input) { actor.requireManager(); return mapper.order(service.returnAll(id, input == null ? null : input.idempotencyKey())); }
}
