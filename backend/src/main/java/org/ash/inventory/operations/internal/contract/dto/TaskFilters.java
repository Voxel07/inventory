package org.ash.inventory.operations.internal.contract.dto;

import jakarta.ws.rs.QueryParam;
import org.ash.inventory.platform.api.InputText;
import java.util.UUID;

/** Filters applied before pagination in the warehouse work queues. */
public class TaskFilters {
    @QueryParam("search") @InputText public String search;
    @QueryParam("status") @InputText public String status;
    @QueryParam("locationId") public UUID locationId;
    @QueryParam("itemId") public UUID itemId;
    @QueryParam("vendorId") public UUID vendorId;
    @QueryParam("eventId") public UUID eventId;
}
