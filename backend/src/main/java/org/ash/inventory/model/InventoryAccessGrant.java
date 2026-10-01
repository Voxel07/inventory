package org.ash.inventory.model;

import jakarta.persistence.*;

@Entity @Table(name = "inventory_access_grants")
public class InventoryAccessGrant extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "policy_id", nullable = false) public InventoryAccessPolicy policy;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id") public UserAccount user;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "group_id") public InventoryAccessGroup group;
    @Column(name = "can_edit", nullable = false) public boolean canEdit;
}
