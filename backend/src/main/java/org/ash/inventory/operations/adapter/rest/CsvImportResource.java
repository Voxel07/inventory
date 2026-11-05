package org.ash.inventory.operations.adapter.rest;

import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.ash.inventory.operations.internal.application.CsvImportService;
import org.ash.inventory.operations.internal.contract.dto.CsvImportDtos;
import java.net.URI;
import java.util.List;
import java.util.UUID;

@Path("/api/csv-imports")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CsvImportResource {
    @Inject CsvImportService imports;
    @POST public Response upload(@NotNull @Valid CsvImportDtos.Upload upload) {
        var job = imports.upload(upload);
        return Response.accepted(job).location(URI.create("/api/csv-imports/" + job.id())).build();
    }
    @GET public List<CsvImportDtos.Job> recent() { return imports.recent(); }
    @GET @Path("/{id}") public CsvImportDtos.Job get(@PathParam("id") UUID id) { return imports.get(id); }
}
