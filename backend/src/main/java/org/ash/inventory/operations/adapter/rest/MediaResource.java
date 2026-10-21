package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.blobs.api.BlobStore;
import org.ash.inventory.blobs.api.MediaTypes;
import org.ash.inventory.operations.internal.application.InventoryMediaService;
import org.ash.inventory.operations.internal.contract.dto.ApiResponses;
import org.ash.inventory.operations.internal.media.MediaService;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.platform.api.ApiException;
import org.ash.inventory.platform.telemetry.InventoryTelemetry;

import io.opentelemetry.api.common.Attributes;
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
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

@Path("/api/media")
public class MediaResource {
    @jakarta.inject.Inject org.ash.inventory.operations.internal.application.InventoryMediaService permissions;
    @jakarta.inject.Inject InventoryTelemetry telemetry;
    @jakarta.inject.Inject org.ash.inventory.blobs.api.BlobStore blobs;
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
        return telemetry.call("media", "upload", "api", () -> {
            actors.current();
            if (upload == null) throw ApiException.badRequest("A file is required");
            if (upload.size() > maxUploadBytes) throw new ApiException(413, "The file is too large");
            String contentType = MediaTypes.sniff(upload.uploadedFile());
            if (contentType == null) throw new ApiException(415, "Only WebP, PNG and JPEG images and PDF documents can be uploaded");
            permissions.requireUploadQuota();
            var stored = media.upload(MediaTypes.fileName(upload.fileName(), contentType), contentType, upload.uploadedFile());
            return new ApiResponses.MediaResponse(stored.key(), stored.url());
        });
    }

    @GET @Path("/{key:.+}")
    public Response get(@PathParam("key") String key) {
        permissions.requireRead(key);
        var content = blobs.read(key);
        var context = io.opentelemetry.context.Context.current();
        StreamingOutput output = target -> {
            try (var scope = context.makeCurrent(); var activity = telemetry.start("media", "download", "api");
                    var source = content.stream()) {
                try {
                    long bytes = source.transferTo(target);
                    telemetry.measure("inventory.media.download.size", bytes, "By", Attributes.empty());
                } catch (java.io.IOException exception) { activity.failure(exception); throw exception; }
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
        media.deleteStaged(key);
        return Response.noContent().build();
    }
}
