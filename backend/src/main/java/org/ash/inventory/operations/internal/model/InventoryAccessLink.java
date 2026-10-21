package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.*;

/**
 * Materialized grant inheritance: {@link #policy} inherits the grants and the owner of
 * {@link #ancestor}, the policy of a private location it is stored in (directly or through
 * sub-locations). Maintained by {@code InventoryAccessInheritance}.
 */
@Entity @Table(name = "inventory_access_links")
public class InventoryAccessLink extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "policy_id", nullable = false) public InventoryAccessPolicy policy;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ancestor_policy_id", nullable = false) public InventoryAccessPolicy ancestor;
}
