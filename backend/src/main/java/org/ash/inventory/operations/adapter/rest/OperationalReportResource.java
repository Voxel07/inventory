package org.ash.inventory.operations.adapter.rest;

import org.ash.inventory.operations.internal.application.OperationalReportService;
import org.ash.inventory.operations.internal.security.ActorService;

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
    @POST @Path("/{name}/rebuild") public jakarta.ws.rs.core.Response rebuild(@PathParam("name") @org.ash.inventory.platform.api.InputText String name) {
        return jakarta.ws.rs.core.Response.accepted(reports.rebuild(name)).build();
    }
    @GET @Path("/{name}/job") public org.ash.inventory.reporting.api.ReportApi.Job job(@PathParam("name") @org.ash.inventory.platform.api.InputText String name) { return reports.job(name); }
    @GET @Path("/{name}/export") public org.ash.inventory.reporting.api.ReportApi.View export(@PathParam("name") @org.ash.inventory.platform.api.InputText String name,
            @QueryParam("generation") Instant generation, @jakarta.ws.rs.core.Context jakarta.ws.rs.core.UriInfo uri) {
        var filters = new LinkedHashMap<String, String>();
        for (String key : List.of("itemId", "eventId", "locationId", "siteId", "category", "status", "from", "to", "search")) {
            String value = uri.getQueryParameters().getFirst(key);
            if (value != null && !value.isBlank()) filters.put(key, value);
        }
        return reports.export(name, filters, generation);
    }
    @Paged @GET @Path("/{name}") public org.ash.inventory.reporting.api.ReportApi.View report(@PathParam("name") @org.ash.inventory.platform.api.InputText String name,
            @QueryParam("itemId") @org.ash.inventory.platform.api.InputText String itemId, @QueryParam("eventId") @org.ash.inventory.platform.api.InputText String eventId, @QueryParam("locationId") @org.ash.inventory.platform.api.InputText String locationId,
            @QueryParam("siteId") @org.ash.inventory.platform.api.InputText String siteId, @QueryParam("category") @org.ash.inventory.platform.api.InputText String category, @QueryParam("status") @org.ash.inventory.platform.api.InputText String status,
            @QueryParam("from") @org.ash.inventory.platform.api.InputText String from, @QueryParam("to") @org.ash.inventory.platform.api.InputText String to, @QueryParam("search") @org.ash.inventory.platform.api.InputText String search,
            @QueryParam("page") @DefaultValue("0") int page, @QueryParam("size") @DefaultValue("100") int size) {
        var filters = new LinkedHashMap<String, String>();
        String[] keys = { "itemId", "eventId", "locationId", "siteId", "category", "status", "from", "to", "search" };
        String[] values = { itemId, eventId, locationId, siteId, category, status, from, to, search };
        for (int i = 0; i < keys.length; i++) if (values[i] != null && !values[i].isBlank()) filters.put(keys[i], values[i]);
        return reports.read(name, filters, page, size);
    }
}
