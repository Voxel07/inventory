package org.ash.inventory.resource;

import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.EquipmentService;
import java.util.Map;
import java.util.UUID;

@Path("/api/equipment-availability") @Produces(MediaType.APPLICATION_JSON)
public class EquipmentAvailabilityResource {
    @Inject EquipmentService service;
    @GET public Map<UUID, EquipmentService.Availability> get(@QueryParam("eventId") UUID eventId) {
        return service.availability(eventId);
    }
}
