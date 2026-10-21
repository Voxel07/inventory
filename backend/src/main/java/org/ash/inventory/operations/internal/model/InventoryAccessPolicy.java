package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.*;

/** A non-null policy makes an item/location private. Ownership is independent of custody. */
@Entity @Table(name = "inventory_access_policies")
public class InventoryAccessPolicy extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_user_id", nullable = false) public UserAccount owner;
    @Column(nullable = false) public long revision;
    /** Items only: public availability for organization orders, independent of ownership and edit rights. */
    @Column(name = "public_use", nullable = false) public boolean publicUse;
}
