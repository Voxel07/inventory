package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.OperationalReportService;
import org.ash.inventory.operations.internal.security.ActorService;
import org.ash.inventory.reporting.api.ReportApi;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import java.util.*;
import java.time.Instant;

@Path("/api/reports") @Produces(MediaType.APPLICATION_JSON)
public class OperationalReportResource {
    @Inject OperationalReportService reports;
    @Inject ActorService actors;
    @GET public Map<String, String> definitions() { return reports.definitions(); }
    @POST @Path("/{name}/rebuild") public jakarta.ws.rs.core.Response rebuild(@PathParam("name") String name) {
        return jakarta.ws.rs.core.Response.accepted(reports.rebuild(name)).build();
    }
    @GET @Path("/{name}/job") public org.ash.inventory.reporting.api.ReportApi.Job job(@PathParam("name") String name) { return reports.job(name); }
    @GET @Path("/{name}/export") public org.ash.inventory.reporting.api.ReportApi.View export(@PathParam("name") String name,
            @QueryParam("generation") Instant generation, @jakarta.ws.rs.core.Context jakarta.ws.rs.core.UriInfo uri) {
        var filters = new LinkedHashMap<String, String>();
        for (String key : List.of("itemId", "eventId", "locationId", "siteId", "category", "status", "from", "to", "search")) {
            String value = uri.getQueryParameters().getFirst(key);
            if (value != null && !value.isBlank()) filters.put(key, value);
        }
        return reports.export(name, filters, generation);
    }
    @Paged @GET @Path("/{name}") public org.ash.inventory.reporting.api.ReportApi.View report(@PathParam("name") String name,
            @QueryParam("itemId") String itemId, @QueryParam("eventId") String eventId, @QueryParam("locationId") String locationId,
            @QueryParam("siteId") String siteId, @QueryParam("category") String category, @QueryParam("status") String status,
            @QueryParam("from") String from, @QueryParam("to") String to, @QueryParam("search") String search,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        var filters = new LinkedHashMap<String, String>();
        String[] keys = { "itemId", "eventId", "locationId", "siteId", "category", "status", "from", "to", "search" };
        String[] values = { itemId, eventId, locationId, siteId, category, status, from, to, search };
        for (int i = 0; i < keys.length; i++) if (values[i] != null && !values[i].isBlank()) filters.put(keys[i], values[i]);
        return reports.read(name, filters, page, size);
    }
}
