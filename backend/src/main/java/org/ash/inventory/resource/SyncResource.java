package org.ash.inventory.resource;

import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.resource.dto.ApiResponses;
import org.ash.inventory.service.SyncService;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Path("/api/sync")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class SyncResource {
    private final SyncService sync;
    public SyncResource(SyncService sync) { this.sync = sync; }

    @POST
    public ApiResponses.SyncBatchResponse sync(@Valid ApiModels.SyncBatch batch) { return sync.sync(batch); }

    @GET @Path("/audit")
    public List<ApiResponses.SyncAuditResponse> audit(@QueryParam("status") String status,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        return sync.audit(status, page, size);
    }

    @GET @Path("/audit/mine")
    public List<ApiResponses.SyncAuditResponse> myAudit(@QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("100") int size) { return sync.myAudit(page, size); }

    @GET @Path("/{id}/context")
    public Map<String, Object> context(@PathParam("id") UUID id) { return sync.context(id); }
}
