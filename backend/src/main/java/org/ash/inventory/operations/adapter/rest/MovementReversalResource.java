package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.MovementReversalService;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.projection.ApiMapper;

import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.UUID;
@Path("/api/transactions/{id}/reversal") @Consumes(MediaType.APPLICATION_JSON) @Produces(MediaType.APPLICATION_JSON)
public class MovementReversalResource {
    @Inject MovementReversalService service;@Inject ApiMapper mapper;
    @POST @Transactional public ApiResponses.TransactionResponse reverse(@PathParam("id")UUID id,@Valid MovementReversalService.Input input){return mapper.transaction(service.reverse(id,input));}
}
