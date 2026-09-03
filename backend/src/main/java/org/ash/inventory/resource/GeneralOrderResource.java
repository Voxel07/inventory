package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.orm.GeneralOrderOrm;
import org.ash.inventory.service.GeneralOrderService;

import java.util.List;

@Path("/api/general-orders")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
@Transactional
public class GeneralOrderResource {
    @Inject ActorService actors;
    @Inject GeneralOrderOrm orm;
    @Inject GeneralOrderService service;
    @Inject ApiMapper mapper;

    @GET
    public List<?> orders() {
        actors.current();
        return orm.orders().stream().map(mapper::generalOrder).toList();
    }

    @POST
    public Object create(@Valid ApiModels.GeneralOrderInput input) {
        actors.current();
        return mapper.generalOrder(service.create(input));
    }
}
