package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.OperationalReportService;
import org.ash.inventory.helper.security.ActorService;
import java.util.*;
import java.time.Instant;

@Path("/api/reports") @Produces(MediaType.APPLICATION_JSON)
public class OperationalReportResource {
    @Inject OperationalReportService reports;
    @Inject ActorService actors;
    @GET public Map<String, String> definitions() { actors.requireWarehouse(); return OperationalReportService.DEFINITIONS; }
    @POST @Path("/{name}/rebuild") public void rebuild(@PathParam("name") String name) { reports.rebuild(name); }
    @GET @Path("/{name}/export") public OperationalReportService.View export(@PathParam("name") String name,
            @QueryParam("generation") Instant generation, @jakarta.ws.rs.core.Context jakarta.ws.rs.core.UriInfo uri) {
        var filters = new LinkedHashMap<String, String>();
        for (String key : List.of("itemId", "eventId", "locationId", "warehouseId", "category", "status", "from", "to", "search")) {
            String value = uri.getQueryParameters().getFirst(key);
            if (value != null && !value.isBlank()) filters.put(key, value);
        }
        return reports.export(name, filters, generation);
    }
    @GET @Path("/{name}") public OperationalReportService.View report(@PathParam("name") String name,
            @QueryParam("itemId") String itemId, @QueryParam("eventId") String eventId, @QueryParam("locationId") String locationId,
            @QueryParam("warehouseId") String warehouseId, @QueryParam("category") String category, @QueryParam("status") String status,
            @QueryParam("from") String from, @QueryParam("to") String to, @QueryParam("search") String search,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        var filters = new LinkedHashMap<String, String>();
        String[] keys = { "itemId", "eventId", "locationId", "warehouseId", "category", "status", "from", "to", "search" };
        String[] values = { itemId, eventId, locationId, warehouseId, category, status, from, to, search };
        for (int i = 0; i < keys.length; i++) if (values[i] != null && !values[i].isBlank()) filters.put(keys[i], values[i]);
        return reports.read(name, filters, page, size);
    }
}
