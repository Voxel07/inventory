package org.ash.inventory.resource;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import org.ash.inventory.service.*;
import org.ash.inventory.resource.dto.ApiResponses;
import java.util.UUID;
@Path("/api/order-copies") @Consumes(MediaType.APPLICATION_JSON) @Produces(MediaType.APPLICATION_JSON)
public class OrderCopyResource {
    @Inject OrderService orders; @Inject ApiQueryService queries;
    public record Input(@NotNull UUID sourceOrderId, @NotNull UUID eventId, @NotNull UUID commandId) {}
    @POST @Transactional public ApiResponses.OrderDetail create(@Valid Input input) {
        return queries.projectAnyOrder(orders.copyAsDraft(input.sourceOrderId(),input.eventId(),input.commandId()));
    }
}
