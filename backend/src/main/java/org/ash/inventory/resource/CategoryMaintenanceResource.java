package org.ash.inventory.resource;

import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.CategoryMaintenanceService;
import org.ash.inventory.service.CategoryMaintenanceService.Policy;
import java.util.List;

@Path("/api/category-maintenance")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class CategoryMaintenanceResource {
    private final CategoryMaintenanceService service;

    public CategoryMaintenanceResource(CategoryMaintenanceService service) { this.service = service; }

    @GET
    public List<Policy> list() { return service.list(); }

    @PUT
    public Policy save(Policy input) { return service.save(input); }
}
