package org.ash.inventory.resource;

import jakarta.validation.Valid;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.model.DomainEnums;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.ReturnSubmissionService;

import java.util.List;
import java.util.UUID;

@Path("/api/returns")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class ReturnSubmissionResource {
    private final ReturnSubmissionService service;
    private final ApiMapper mapper;

    public ReturnSubmissionResource(ReturnSubmissionService service, ApiMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @GET
    @Transactional
    public List<ApiResponses.ReturnSubmissionResponse> list(
            @QueryParam("status") DomainEnums.ReturnSubmissionStatus status) {
        return service.list(status).stream().map(mapper::returnSubmission).toList();
    }

    @POST
    @Transactional
    public ApiResponses.ReturnSubmissionResponse create(@Valid ApiModels.ReturnSubmissionInput input) {
        return mapper.returnSubmission(service.create(input));
    }

    @POST @Path("/{id}/acknowledge")
    @Transactional
    public ApiResponses.ReturnSubmissionResponse acknowledge(@PathParam("id") UUID id,
            ApiModels.ReturnDecisionInput input) {
        return mapper.returnSubmission(service.acknowledge(id, input));
    }

    @POST @Path("/{id}/reject")
    @Transactional
    public ApiResponses.ReturnSubmissionResponse reject(@PathParam("id") UUID id,
            ApiModels.ReturnDecisionInput input) {
        return mapper.returnSubmission(service.reject(id, input));
    }
}
