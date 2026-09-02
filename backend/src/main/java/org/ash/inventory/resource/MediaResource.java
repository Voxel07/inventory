package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.ash.inventory.helper.security.ActorService;
import org.ash.inventory.helper.storage.MediaService;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import java.io.IOException;
import java.nio.file.Files;

@Path("/api/media")
public class MediaResource {
    @Inject MediaService media;
    @Inject ActorService actors;
    @ConfigProperty(name = "inventory.media.mode") String mode;

    @POST
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public Object upload(@RestForm("file") FileUpload upload) {
        actors.requireManager();
        if (upload == null) throw ApiException.badRequest("A file is required");
        try {
            String contentType = upload.contentType() == null ? "application/octet-stream" : upload.contentType();
            return media.store(upload.fileName(), contentType, Files.readAllBytes(upload.uploadedFile()));
        } catch (IOException exception) { throw new ApiException(500, "Could not read uploaded file"); }
    }

    @GET @Path("/{key}")
    public Response get(@PathParam("key") String key) {
        if ("s3".equalsIgnoreCase(mode)) return Response.temporaryRedirect(java.net.URI.create(media.publicUrl(key))).build();
        return Response.ok(media.readLocal(key)).type(MediaType.APPLICATION_OCTET_STREAM).build();
    }
}
