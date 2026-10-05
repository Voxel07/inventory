package org.ash.inventory.resource;

import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;
import jakarta.ws.rs.container.ResourceInfo;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.ext.Provider;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/** Optional audit of actual HTTP dispatches; never part of the production application. */
@Provider
public class EndpointCoverageFilter implements ContainerResponseFilter {
    @Context ResourceInfo resource;

    @Override
    public void filter(ContainerRequestContext request, ContainerResponseContext response) throws IOException {
        String output = System.getProperty("inventory.test.endpoint-coverage");
        if (output == null || resource.getResourceMethod() == null) return;
        String row = resource.getResourceClass().getSimpleName() + "\t"
                + resource.getResourceMethod().getName() + "\t" + request.getMethod() + "\t"
                + response.getStatus() + "\n";
        synchronized (EndpointCoverageFilter.class) {
            Files.writeString(Path.of(output), row, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        }
    }
}
