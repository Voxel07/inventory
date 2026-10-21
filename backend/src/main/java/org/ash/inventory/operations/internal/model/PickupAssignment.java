package org.ash.inventory.operations.internal.model;

import java.util.UUID;

/** Per-order overrides; an absent entry uses the item's responsible person and category. */
public record PickupAssignment(UUID responsiblePersonId, String groupName, UUID pickupLocationId) {}
