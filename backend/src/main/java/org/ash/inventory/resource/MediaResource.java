package org.ash.inventory.resource;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.helper.storage.MediaService;
import org.ash.inventory.resource.dto.ApiResponses;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

@Path("/api/media")
public class MediaResource {
    private final MediaService media;
    private final ActorService actors;

    public MediaResource(MediaService media, ActorService actors) {
        this.media = media;
        this.actors = actors;
    }

    @POST
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public ApiResponses.MediaResponse upload(@RestForm("file") FileUpload upload) {
        actors.requireManager();
        if (upload == null) throw ApiException.badRequest("A file is required");
        String contentType = upload.contentType() == null ? "application/octet-stream" : upload.contentType();
        var stored = media.store(upload.fileName(), contentType, upload.uploadedFile());
        return new ApiResponses.MediaResponse(stored.key(), stored.url());
    }

    @GET @Path("/{key:.+}")
    public Response get(@PathParam("key") String key) {
        if (key.startsWith("vendor-documents/")) actors.requireWarehouse(); else actors.current();
        var content = media.read(key);
        StreamingOutput output = target -> {
            try (var source = content.stream()) {
                source.transferTo(target);
            }
        };
        return Response.ok(output).type(content.contentType())
                .header("Content-Length", content.contentLength())
                .header("Cache-Control", "private, max-age=3600")
                .header("Vary", "Authorization")
                .header("X-Content-Type-Options", "nosniff").build();
    }

    @DELETE @Path("/{key:.+}")
    public Response deleteStaged(@PathParam("key") String key) {
        actors.requireManager();
        media.deleteStaged(key);
        return Response.noContent().build();
    }
}
