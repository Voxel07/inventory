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
import org.ash.inventory.helper.storage.MediaTypes;
import org.ash.inventory.resource.dto.ApiResponses;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

@Path("/api/media")
public class MediaResource {
    @jakarta.inject.Inject org.ash.inventory.service.InventoryMediaService permissions;
    private final MediaService media;
    private final ActorService actors;
    private final long maxUploadBytes;

    public MediaResource(MediaService media, ActorService actors,
            @org.eclipse.microprofile.config.inject.ConfigProperty(name = "inventory.media.max-upload-bytes", defaultValue = "10485760") long maxUploadBytes) {
        this.media = media;
        this.actors = actors;
        this.maxUploadBytes = maxUploadBytes;
    }

    @POST
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @jakarta.transaction.Transactional
    public ApiResponses.MediaResponse upload(@RestForm("file") FileUpload upload) {
        actors.current();
        if (upload == null) throw ApiException.badRequest("A file is required");
        if (upload.size() > maxUploadBytes) throw new ApiException(413, "The file is too large");
        String contentType = MediaTypes.sniff(upload.uploadedFile());
        if (contentType == null) throw new ApiException(415, "Only WebP, PNG and JPEG images and PDF documents can be uploaded");
        permissions.requireUploadQuota();
        var stored = media.store(MediaTypes.fileName(upload.fileName(), contentType), contentType, upload.uploadedFile());
        permissions.register(stored.key());
        return new ApiResponses.MediaResponse(stored.key(), stored.url());
    }

    @GET @Path("/{key:.+}")
    public Response get(@PathParam("key") String key) {
        permissions.requireRead(key);
        var content = media.read(key);
        StreamingOutput output = target -> {
            try (var source = content.stream()) {
                source.transferTo(target);
            }
        };
        // Only allowlisted images render inline; anything else is a download.
        var response = Response.ok(output).type(content.contentType());
        if (!MediaTypes.isImage(content.contentType())) response.header("Content-Disposition", "attachment");
        return response
                .header("Content-Length", content.contentLength())
                .header("Cache-Control", "private, no-store")
                .header("Vary", "Authorization")
                .header("X-Content-Type-Options", "nosniff").build();
    }

    @DELETE @Path("/{key:.+}")
    public Response deleteStaged(@PathParam("key") String key) {
        actors.current();
        permissions.requireStaged(key);
        media.deleteStaged(key);
        permissions.forgetStaged(key);
        return Response.noContent().build();
    }
}
