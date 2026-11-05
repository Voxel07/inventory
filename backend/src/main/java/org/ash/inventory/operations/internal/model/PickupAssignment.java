package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.api.InputText;

import java.util.UUID;

/** Per-order overrides; an absent entry uses the item's responsible person and category. */
public record PickupAssignment(UUID responsiblePersonId, @InputText(max = 160) String groupName, UUID pickupLocationId) {}
