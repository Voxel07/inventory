package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.ReturnSubmissionService;
import org.ash.inventory.operations.internal.contract.ApiModels;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.model.DomainEnums;
import org.ash.inventory.operations.internal.model.ReturnSubmission;
import org.ash.inventory.operations.internal.projection.ApiMapper;

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
        var submissions = service.list(status);
        var damage = service.reportedDamage(submissions);
        return submissions.stream().map(value -> mapper.returnSubmission(value, damage.get(value.id))).toList();
    }

    private ApiResponses.ReturnSubmissionResponse response(org.ash.inventory.operations.internal.model.ReturnSubmission value) {
        return mapper.returnSubmission(value, service.reportedDamage(List.of(value)).get(value.id));
    }

    @POST
    @Transactional
    public ApiResponses.ReturnSubmissionResponse create(@Valid ApiModels.ReturnSubmissionInput input) {
        return response(service.create(input));
    }

    @POST @Path("/{id}/acknowledge")
    @Transactional
    public ApiResponses.ReturnSubmissionResponse acknowledge(@PathParam("id") UUID id,
            ApiModels.ReturnDecisionInput input) {
        return response(service.acknowledge(id, input));
    }

    @POST @Path("/{id}/reject")
    @Transactional
    public ApiResponses.ReturnSubmissionResponse reject(@PathParam("id") UUID id,
            ApiModels.ReturnDecisionInput input) {
        return response(service.reject(id, input));
    }
}
