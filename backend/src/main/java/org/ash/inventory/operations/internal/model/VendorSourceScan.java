package org.ash.inventory.operations.internal.model;

import org.ash.inventory.platform.persistence.BaseEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** One manual run of the item link scan; {@link #createdAt} is when it ran. */
@Entity
@Table(name = "vendor_source_scans")
public class VendorSourceScan extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "actor_id", nullable = false)
    public UserAccount actor;
    @Column(name = "linked_items", nullable = false) public int linkedItems;
    @Column(name = "skipped_items", nullable = false) public int skippedItems;
    @Column(name = "created_vendors", nullable = false) public int createdVendors;
}
